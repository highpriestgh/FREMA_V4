using Duende.Bff;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Workflow;

public sealed record WorkflowStepDto(
    Guid Id,
    int Order,
    string Name,
    string? Instructions,
    StepAssignmentMode AssignmentMode,
    Guid? DepartmentId,
    string? Department,
    Guid? RoleId,
    string? Role,
    Guid? AssigneeId,
    string? Assignee,
    StepCompletionPolicy CompletionPolicy,
    bool IsReviewOnly,
    int? DueAfterDays,
    Priority DefaultPriority);

public sealed record WorkflowDefinitionDto(
    Guid Id,
    string Name,
    string? Description,
    int Version,
    bool IsActive,
    bool IsDefault,
    Guid? DocumentTypeId,
    string? DocumentType,
    Guid? OriginatingDepartmentId,
    string? OriginatingDepartment,
    int DocumentCount,
    IReadOnlyList<WorkflowStepDto> Steps);

public sealed record SaveWorkflowStepRequest(
    string Name,
    string? Instructions,
    StepAssignmentMode AssignmentMode,
    Guid? DepartmentId,
    Guid? RoleId,
    Guid? AssigneeId,
    StepCompletionPolicy CompletionPolicy,
    bool IsReviewOnly,
    int? DueAfterDays,
    Priority DefaultPriority);

/// <summary>Steps are taken in list order; the server assigns <c>Order</c> from position.</summary>
public sealed record SaveWorkflowRequest(
    string Name,
    string? Description,
    Guid? DocumentTypeId,
    Guid? OriginatingDepartmentId,
    IReadOnlyList<SaveWorkflowStepRequest> Steps);

/// <summary>
/// Administration of approval routes — what makes workflow "data, not code".
/// <para>
/// Until this existed a route could only be changed by editing the database directly, which
/// is exactly the dependence on a developer that configurable routes were meant to remove.
/// </para>
/// </summary>
public static class WorkflowDefinitionEndpoints
{
    public static IEndpointRouteBuilder MapWorkflowDefinitionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/workflows").WithTags("Workflows");
        group.AsBffApiEndpoint();

        // Readable by anyone who routes documents: knowing which routes exist, and what
        // each step expects, is part of routing well.
        group.MapGet("/", ListAsync).RequireAuthorization(Permissions.RouteDocuments);
        group.MapGet("/{id:guid}", GetAsync).RequireAuthorization(Permissions.RouteDocuments);

        group.MapPost("/", CreateAsync).RequireAuthorization(Permissions.ManageSettings);
        group.MapPut("/{id:guid}", UpdateAsync).RequireAuthorization(Permissions.ManageSettings);
        group.MapPost("/{id:guid}/default", MakeDefaultAsync).RequireAuthorization(Permissions.ManageSettings);
        group.MapPost("/{id:guid}/active", SetActiveAsync).RequireAuthorization(Permissions.ManageSettings);
        group.MapDelete("/{id:guid}", DeleteAsync).RequireAuthorization(Permissions.ManageSettings);

        return app;
    }

    private static async Task<Ok<IReadOnlyList<WorkflowDefinitionDto>>> ListAsync(
        bool? includeInactive,
        FremaDbContext db,
        CancellationToken ct)
    {
        var query = Load(db);

        if (includeInactive is not true)
        {
            query = query.Where(w => w.IsActive);
        }

        var definitions = await query
            .OrderByDescending(w => w.IsDefault)
            .ThenBy(w => w.Name)
            .ThenByDescending(w => w.Version)
            .ToListAsync(ct);

        var counts = await DocumentCountsAsync(db, definitions.Select(d => d.Id), ct);

        return TypedResults.Ok<IReadOnlyList<WorkflowDefinitionDto>>(
            [.. definitions.Select(d => ToDto(d, counts.GetValueOrDefault(d.Id)))]);
    }

    private static async Task<Ok<WorkflowDefinitionDto>> GetAsync(
        Guid id, FremaDbContext db, CancellationToken ct)
    {
        var definition = await Load(db).FirstOrDefaultAsync(w => w.Id == id, ct)
            ?? throw new NotFoundException("Workflow", id);

        var count = await db.Documents.CountAsync(d => d.WorkflowDefinitionId == id, ct);
        return TypedResults.Ok(ToDto(definition, count));
    }

    private static async Task<Created<WorkflowDefinitionDto>> CreateAsync(
        SaveWorkflowRequest request,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var name = await ValidateAsync(db, request, ct);

        if (await db.WorkflowDefinitions.AnyAsync(w => w.Name == name, ct))
        {
            throw new ConflictException($"A workflow named '{name}' already exists.");
        }

        var definition = new WorkflowDefinition
        {
            Name = name,
            Description = request.Description?.Trim(),
            DocumentTypeId = request.DocumentTypeId,
            OriginatingDepartmentId = request.OriginatingDepartmentId,
            IsActive = true,
            Version = 1,
            Steps = BuildSteps(request.Steps),
        };

        db.WorkflowDefinitions.Add(definition);
        audit.Record("workflow.created", AuditEntityType.WorkflowDefinition, definition.Id,
            new { name, Steps = request.Steps.Count });
        await db.SaveChangesAsync(ct);

        return TypedResults.Created($"/api/workflows/{definition.Id}", await ReloadAsync(db, definition.Id, ct));
    }

    /// <summary>
    /// Saves changes to a route.
    /// <para>
    /// A route no document has used is edited in place. A route that <em>has</em> been used
    /// is never mutated: its documents' routings point at its steps, and changing those steps
    /// would rewrite the process underneath people partway through it — and falsify the
    /// history of documents already closed. Instead a new version is created, the old one is
    /// retired, and running documents finish on the version they started on.
    /// </para>
    /// The response is the definition to use from now on, whose id may differ from the one
    /// requested.
    /// </summary>
    private static async Task<Ok<WorkflowDefinitionDto>> UpdateAsync(
        Guid id,
        SaveWorkflowRequest request,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var existing = await db.WorkflowDefinitions
            .Include(w => w.Steps)
            .FirstOrDefaultAsync(w => w.Id == id, ct)
            ?? throw new NotFoundException("Workflow", id);

        var name = await ValidateAsync(db, request, ct);

        if (name != existing.Name
            && await db.WorkflowDefinitions.AnyAsync(w => w.Name == name, ct))
        {
            throw new ConflictException($"A workflow named '{name}' already exists.");
        }

        var inUse = await db.Documents.AnyAsync(d => d.WorkflowDefinitionId == id, ct);

        if (!inUse)
        {
            existing.Name = name;
            existing.Description = request.Description?.Trim();
            existing.DocumentTypeId = request.DocumentTypeId;
            existing.OriginatingDepartmentId = request.OriginatingDepartmentId;
            existing.UpdatedAt = DateTimeOffset.UtcNow;

            db.WorkflowSteps.RemoveRange(existing.Steps);
            // Deleting and re-inserting in one SaveChanges would collide on the unique
            // (definition, order) index, so the removals are committed first.
            await db.SaveChangesAsync(ct);

            existing.Steps = BuildSteps(request.Steps);

            audit.Record("workflow.updated", AuditEntityType.WorkflowDefinition, id, new { name });
            await db.SaveChangesAsync(ct);

            return TypedResults.Ok(await ReloadAsync(db, id, ct));
        }

        // The context retries transient failures, and a retrying strategy cannot replay a
        // transaction it did not open — so the whole unit runs inside the strategy, which
        // re-executes all of it on a retry rather than resuming halfway.
        var successorId = await db.InRetriableTransactionAsync(async () =>
        {
            var current = await db.WorkflowDefinitions.FirstAsync(w => w.Id == id, ct);

            var latestVersion = await db.WorkflowDefinitions
                .Where(w => w.Name == current.Name)
                .MaxAsync(w => w.Version, ct);

            var wasDefault = current.IsDefault;

            // Retire the old version first. The default flag is guarded by a filtered unique
            // index, so it has to leave the old row before it can land on the new one.
            current.IsActive = false;
            current.IsDefault = false;
            current.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            var successor = new WorkflowDefinition
            {
                Name = name,
                Description = request.Description?.Trim(),
                DocumentTypeId = request.DocumentTypeId,
                OriginatingDepartmentId = request.OriginatingDepartmentId,
                IsActive = true,
                IsDefault = wasDefault,
                Version = latestVersion + 1,
                Steps = BuildSteps(request.Steps),
            };

            db.WorkflowDefinitions.Add(successor);
            audit.Record("workflow.versioned", AuditEntityType.WorkflowDefinition, successor.Id,
                new { name, From = current.Version, To = successor.Version, Previous = current.Id });

            await db.SaveChangesAsync(ct);
            return successor.Id;
        }, ct);

        return TypedResults.Ok(await ReloadAsync(db, successorId, ct));
    }

    private static async Task<Ok<WorkflowDefinitionDto>> MakeDefaultAsync(
        Guid id,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var target = await db.WorkflowDefinitions.FirstOrDefaultAsync(w => w.Id == id, ct)
            ?? throw new NotFoundException("Workflow", id);

        if (!target.IsActive)
        {
            throw new DomainRuleException("An inactive workflow cannot be the default.");
        }

        if (target.IsDefault)
        {
            return TypedResults.Ok(await ReloadAsync(db, id, ct));
        }

        await db.InRetriableTransactionAsync(async () =>
        {
            // Two statements, in this order: the filtered unique index allows only one
            // default, so the current one is cleared before the new one is set.
            await db.WorkflowDefinitions
                .Where(w => w.IsDefault)
                .ExecuteUpdateAsync(set => set.SetProperty(w => w.IsDefault, false), ct);

            await db.WorkflowDefinitions
                .Where(w => w.Id == id)
                .ExecuteUpdateAsync(set => set.SetProperty(w => w.IsDefault, true), ct);

            audit.Record("workflow.default", AuditEntityType.WorkflowDefinition, id, new { target.Name });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);

        return TypedResults.Ok(await ReloadAsync(db, id, ct));
    }

    private static async Task<Ok<WorkflowDefinitionDto>> SetActiveAsync(
        Guid id,
        bool active,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var definition = await db.WorkflowDefinitions.FirstOrDefaultAsync(w => w.Id == id, ct)
            ?? throw new NotFoundException("Workflow", id);

        // Without an active default, any document no scoped route matches could not be
        // submitted at all.
        if (!active && definition.IsDefault)
        {
            throw new DomainRuleException(
                "This is the default workflow. Make another workflow the default before deactivating it.");
        }

        definition.IsActive = active;
        definition.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Record(active ? "workflow.activated" : "workflow.deactivated",
            AuditEntityType.WorkflowDefinition, id, new { definition.Name });
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(await ReloadAsync(db, id, ct));
    }

    private static async Task<NoContent> DeleteAsync(
        Guid id,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var definition = await db.WorkflowDefinitions.FirstOrDefaultAsync(w => w.Id == id, ct)
            ?? throw new NotFoundException("Workflow", id);

        if (definition.IsDefault)
        {
            throw new DomainRuleException(
                "The default workflow cannot be deleted. Make another workflow the default first.");
        }

        var documents = await db.Documents.CountAsync(d => d.WorkflowDefinitionId == id, ct);
        if (documents > 0)
        {
            throw new ConflictException(
                $"This workflow has been used by {documents} document(s) and is part of their " +
                "history. Deactivate it instead.");
        }

        db.WorkflowDefinitions.Remove(definition);
        audit.Record("workflow.deleted", AuditEntityType.WorkflowDefinition, id, new { definition.Name });
        await db.SaveChangesAsync(ct);

        return TypedResults.NoContent();
    }

    /// <summary>
    /// Checks a route before anything is written, so an administrator gets a sentence naming
    /// the problem rather than a database constraint violation.
    /// </summary>
    private static async Task<string> ValidateAsync(
        FremaDbContext db, SaveWorkflowRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new DomainRuleException("A workflow name is required.");
        }

        if (request.Steps is null || request.Steps.Count == 0)
        {
            throw new DomainRuleException("A workflow needs at least one step.");
        }

        if (request.DocumentTypeId is { } typeId && !await db.DocumentTypes.AnyAsync(t => t.Id == typeId, ct))
        {
            throw new NotFoundException("Document type", typeId);
        }

        if (request.OriginatingDepartmentId is { } deptId && !await db.Departments.AnyAsync(d => d.Id == deptId, ct))
        {
            throw new NotFoundException("Department", deptId);
        }

        for (var i = 0; i < request.Steps.Count; i++)
        {
            var step = request.Steps[i];
            var label = string.IsNullOrWhiteSpace(step.Name) ? $"Step {i + 1}" : $"Step {i + 1} ('{step.Name}')";

            if (string.IsNullOrWhiteSpace(step.Name))
            {
                throw new DomainRuleException($"{label} needs a name.");
            }

            if (step.DueAfterDays is < 1)
            {
                throw new DomainRuleException($"{label}: a due period must be at least one day.");
            }

            switch (step.AssignmentMode)
            {
                case StepAssignmentMode.Department when step.DepartmentId is null:
                    throw new DomainRuleException($"{label} assigns to a department, but none is chosen.");
                case StepAssignmentMode.Role when step.RoleId is null:
                    throw new DomainRuleException($"{label} assigns to a role, but none is chosen.");
                case StepAssignmentMode.User when step.AssigneeId is null:
                    throw new DomainRuleException($"{label} assigns to a person, but none is chosen.");
            }

            if (step.DepartmentId is { } d && !await db.Departments.AnyAsync(x => x.Id == d, ct))
            {
                throw new NotFoundException("Department", d);
            }

            if (step.RoleId is { } r && !await db.Roles.AnyAsync(x => x.Id == r, ct))
            {
                throw new NotFoundException("Role", r);
            }

            if (step.AssigneeId is { } u && !await db.Users.AnyAsync(x => x.Id == u && x.IsActive, ct))
            {
                throw new DomainRuleException($"{label}: the chosen person does not exist or is inactive.");
            }
        }

        return request.Name.Trim();
    }

    /// <summary>
    /// Order comes from list position, never from the client, so steps are always contiguous
    /// from one and cannot collide on the unique (definition, order) index.
    /// </summary>
    private static List<WorkflowStep> BuildSteps(IReadOnlyList<SaveWorkflowStepRequest> steps) =>
        [.. steps.Select((s, index) => new WorkflowStep
        {
            Order = index + 1,
            Name = s.Name.Trim(),
            Instructions = s.Instructions?.Trim(),
            AssignmentMode = s.AssignmentMode,

            // Only the field the mode uses is kept, so a step switched from "role" to "person"
            // does not quietly retain a stale role. ChosenAtRuntime keeps its department,
            // where it constrains who may be picked.
            DepartmentId = s.AssignmentMode is StepAssignmentMode.Department or StepAssignmentMode.ChosenAtRuntime
                ? s.DepartmentId
                : null,
            RoleId = s.AssignmentMode == StepAssignmentMode.Role ? s.RoleId : null,
            AssigneeId = s.AssignmentMode == StepAssignmentMode.User ? s.AssigneeId : null,

            CompletionPolicy = s.CompletionPolicy,
            IsReviewOnly = s.IsReviewOnly,
            DueAfterDays = s.DueAfterDays,
            DefaultPriority = s.DefaultPriority,
        })];

    private static IQueryable<WorkflowDefinition> Load(FremaDbContext db) =>
        db.WorkflowDefinitions
            .AsNoTracking()
            .Include(w => w.DocumentType)
            .Include(w => w.OriginatingDepartment)
            .Include(w => w.Steps).ThenInclude(s => s.Department)
            .Include(w => w.Steps).ThenInclude(s => s.Role)
            .Include(w => w.Steps).ThenInclude(s => s.Assignee)
            .AsSplitQuery();

    private static async Task<WorkflowDefinitionDto> ReloadAsync(FremaDbContext db, Guid id, CancellationToken ct)
    {
        var definition = await Load(db).FirstAsync(w => w.Id == id, ct);
        var count = await db.Documents.CountAsync(d => d.WorkflowDefinitionId == id, ct);
        return ToDto(definition, count);
    }

    private static async Task<Dictionary<Guid, int>> DocumentCountsAsync(
        FremaDbContext db, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.ToList();

        return await db.Documents
            .Where(d => d.WorkflowDefinitionId != null && list.Contains(d.WorkflowDefinitionId.Value))
            .GroupBy(d => d.WorkflowDefinitionId!.Value)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
    }

    private static WorkflowDefinitionDto ToDto(WorkflowDefinition w, int documentCount) => new(
        w.Id,
        w.Name,
        w.Description,
        w.Version,
        w.IsActive,
        w.IsDefault,
        w.DocumentTypeId,
        w.DocumentType?.Name,
        w.OriginatingDepartmentId,
        w.OriginatingDepartment?.Name,
        documentCount,
        [.. w.Steps.OrderBy(s => s.Order).Select(s => new WorkflowStepDto(
            s.Id,
            s.Order,
            s.Name,
            s.Instructions,
            s.AssignmentMode,
            s.DepartmentId,
            s.Department?.Name,
            s.RoleId,
            s.Role?.Name,
            s.AssigneeId,
            s.Assignee is null ? null : $"{s.Assignee.FirstName} {s.Assignee.LastName}",
            s.CompletionPolicy,
            s.IsReviewOnly,
            s.DueAfterDays,
            s.DefaultPriority))]);
}
