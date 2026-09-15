using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Settings;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Workflow;

/// <summary>What an assignee decided on their step.</summary>
public enum WorkflowDecision
{
    Approve,
    Reject,
    Review,
}

/// <summary>
/// Executes admin-defined routes: picks a definition, creates assignments, advances steps,
/// and sends rejected documents back to their sender.
/// <para>
/// All of this lived in stored procedures that no longer exist. The behaviour here is a
/// deliberate reconstruction, not a port — see the decisions recorded alongside each rule.
/// </para>
/// </summary>
public sealed class WorkflowEngine(
    FremaDbContext db,
    IAuditService audit,
    ISettingsService settings,
    ILogger<WorkflowEngine> logger)
{
    /// <summary>
    /// Chooses the route for a document: the most specific active definition wins.
    /// A definition matching both type and department beats one matching only type, which
    /// beats one matching only department, which beats the default.
    /// </summary>
    public async Task<WorkflowDefinition> SelectDefinitionAsync(
        Guid? documentTypeId,
        Guid? departmentId,
        CancellationToken ct = default)
    {
        var candidates = await db.WorkflowDefinitions
            .Include(w => w.Steps.OrderBy(s => s.Order))
            .Where(w => w.IsActive)
            .Where(w => (w.DocumentTypeId == null || w.DocumentTypeId == documentTypeId)
                        && (w.OriginatingDepartmentId == null || w.OriginatingDepartmentId == departmentId))
            .ToListAsync(ct);

        var best = candidates
            .OrderByDescending(w => Specificity(w, documentTypeId, departmentId))
            .ThenByDescending(w => w.Version)
            .FirstOrDefault();

        if (best is null || best.Steps.Count == 0)
        {
            throw new DomainRuleException(
                "No active workflow with at least one step applies to this document. " +
                "An administrator must define one, or mark a route as the default.");
        }

        return best;

        static int Specificity(WorkflowDefinition w, Guid? typeId, Guid? deptId)
        {
            var score = 0;
            if (w.DocumentTypeId is not null && w.DocumentTypeId == typeId) score += 2;
            if (w.OriginatingDepartmentId is not null && w.OriginatingDepartmentId == deptId) score += 1;
            if (w.IsDefault && score == 0) score = -1; // last resort, but still ahead of nothing
            return score;
        }
    }

    /// <summary>
    /// Starts a document on its route, creating the assignments for the first step.
    /// </summary>
    /// <param name="chosenAssignees">
    /// Required when the first step's mode is <see cref="StepAssignmentMode.ChosenAtRuntime"/>.
    /// </param>
    public async Task SubmitAsync(
        Document document,
        IReadOnlyList<Guid>? chosenAssignees,
        Guid submittedById,
        string? note,
        CancellationToken ct = default)
    {
        if (document.Status is not (DocumentStatus.Draft or DocumentStatus.Returned))
        {
            throw new ConflictException(
                $"A document with status '{document.Status}' cannot be submitted.");
        }

        // Submitting starts the route from step one. A returned document that still holds a
        // live assignment must be *resumed* through that assignment instead — restarting it
        // would discard every approval already given. Only a document returned from the
        // first step, which has no earlier step to hold an assignment, is submitted afresh.
        if (document.Status == DocumentStatus.Returned
            && await db.WorkflowRoutings.AnyAsync(
                r => r.DocumentId == document.Id && r.Status == RoutingStatus.Pending, ct))
        {
            throw new ConflictException(
                "This document was returned with an open assignment. Act on that assignment " +
                "to send it on — submitting again would restart its approval route.");
        }

        var definition = await SelectDefinitionAsync(
            document.DocumentTypeId,
            await DepartmentOfAsync(submittedById, ct),
            ct);

        var firstStep = definition.Steps.OrderBy(s => s.Order).First();

        document.WorkflowDefinitionId = definition.Id;
        document.CurrentStepId = firstStep.Id;
        document.Status = DocumentStatus.Pending;
        document.UpdatedAt = DateTimeOffset.UtcNow;

        await CreateAssignmentsAsync(
            document,
            firstStep,
            chosenAssignees,
            routedById: submittedById,
            note: note,
            returnedFrom: null,
            ct);

        audit.Record(AuditActions.DocumentSubmitted, AuditEntityType.Document, document.Id,
            new { definition.Name, Step = firstStep.Name });

        logger.LogInformation("Document {DocumentId} submitted to workflow {Workflow}",
            document.Id, definition.Name);
    }

    /// <summary>
    /// Records one assignee's decision and moves the document accordingly.
    /// </summary>
    /// <param name="nextAssignees">
    /// Recipients for the following step, required when that step chooses them at routing
    /// time. Supplied with the decision so approval and routing are a single act.
    /// </param>
    public async Task ActAsync(
        Document document,
        Guid userId,
        WorkflowDecision decision,
        string? comment,
        IReadOnlyList<Guid>? nextAssignees = null,
        CancellationToken ct = default)
    {
        if (document.CurrentStepId is null)
        {
            throw new ConflictException("This document is not awaiting a decision.");
        }

        var routing = await db.WorkflowRoutings
            .FirstOrDefaultAsync(r => r.DocumentId == document.Id
                                      && r.WorkflowStepId == document.CurrentStepId
                                      && r.AssignedToId == userId
                                      && r.Status == RoutingStatus.Pending, ct)
            ?? throw new ConflictException(
                "You have no pending assignment on this document's current step.");

        var step = await db.WorkflowSteps.FirstAsync(s => s.Id == document.CurrentStepId, ct);

        if (decision == WorkflowDecision.Reject && step.IsReviewOnly)
        {
            throw new DomainRuleException(
                $"Step '{step.Name}' is review-only and cannot return the document.");
        }

        if (decision == WorkflowDecision.Reject && string.IsNullOrWhiteSpace(comment))
        {
            // A rejection without a reason gives the sender nothing to act on.
            throw new DomainRuleException("A reason is required when returning a document.");
        }

        routing.Status = decision switch
        {
            WorkflowDecision.Approve => RoutingStatus.Approved,
            WorkflowDecision.Reject => RoutingStatus.Rejected,
            WorkflowDecision.Review => RoutingStatus.Reviewed,
            _ => throw new ArgumentOutOfRangeException(nameof(decision)),
        };
        routing.Decision = comment;
        routing.ActedAt = DateTimeOffset.UtcNow;

        if (decision == WorkflowDecision.Reject)
        {
            await ReturnToSenderAsync(document, routing, step, ct);
            return;
        }

        await TryCompleteStepAsync(document, step, routing, nextAssignees, ct);
    }

    /// <summary>
    /// Sends a rejected document back to whoever routed it — the agreed rule: a rejection is
    /// never terminal at a step.
    /// <para>
    /// The return address is <see cref="WorkflowRouting.RoutedById"/>, falling back to the
    /// document's owner for the first step. Any sibling assignments at the rejected step are
    /// withdrawn, because the step is no longer live.
    /// </para>
    /// </summary>
    private async Task ReturnToSenderAsync(
        Document document,
        WorkflowRouting rejected,
        WorkflowStep step,
        CancellationToken ct)
    {
        await WithdrawSiblingsAsync(document.Id, step.Id, rejected.Id, ct);

        var previousStep = await db.WorkflowSteps
            .Where(s => s.WorkflowDefinitionId == step.WorkflowDefinitionId && s.Order < step.Order)
            .OrderByDescending(s => s.Order)
            .FirstOrDefaultAsync(ct);

        document.Status = DocumentStatus.Returned;
        document.CurrentStepId = previousStep?.Id;
        document.UpdatedAt = DateTimeOffset.UtcNow;

        var senderId = rejected.RoutedById ?? document.UploadedById;

        if (previousStep is not null)
        {
            // The sender gets a live assignment back at their own step. Approving it again
            // re-submits the corrected document forward — the "resume, don't restart"
            // reading of a returned document.
            db.WorkflowRoutings.Add(new WorkflowRouting
            {
                DocumentId = document.Id,
                WorkflowStepId = previousStep.Id,
                DepartmentId = await DepartmentForAsync(previousStep, senderId, ct),
                AssignedToId = senderId,
                RoutedById = rejected.AssignedToId,
                Priority = rejected.Priority,
                Status = RoutingStatus.Pending,
                Note = rejected.Decision,
                ReturnedFromRoutingId = rejected.Id,
                DueDate = await DueDateForAsync(previousStep, ct),
            });
        }
        // With no earlier step the document simply goes back to its owner, who edits and
        // re-submits it. No assignment is needed: they reach it through their own documents.

        audit.Record(AuditActions.DocumentReturned, AuditEntityType.Workflow, document.Id,
            new { Step = step.Name, To = senderId, Reason = rejected.Decision });

        logger.LogInformation("Document {DocumentId} returned to {UserId} from step {Step}",
            document.Id, senderId, step.Name);
    }

    /// <summary>
    /// Decides whether the step is finished and, if so, advances the document.
    /// Under <see cref="StepCompletionPolicy.AnyOne"/> the first decision closes it; under
    /// <see cref="StepCompletionPolicy.Unanimous"/> every assignee must have acted.
    /// </summary>
    private async Task TryCompleteStepAsync(
        Document document,
        WorkflowStep step,
        WorkflowRouting acted,
        IReadOnlyList<Guid>? nextAssignees,
        CancellationToken ct)
    {
        if (step.CompletionPolicy == StepCompletionPolicy.Unanimous)
        {
            var stillPending = await db.WorkflowRoutings
                .AnyAsync(r => r.DocumentId == document.Id
                               && r.WorkflowStepId == step.Id
                               && r.Status == RoutingStatus.Pending
                               && r.Id != acted.Id, ct);

            if (stillPending)
            {
                logger.LogInformation(
                    "Document {DocumentId} step {Step} awaits further approvals",
                    document.Id, step.Name);
                return;
            }
        }
        else
        {
            await WithdrawSiblingsAsync(document.Id, step.Id, acted.Id, ct);
        }

        await AdvanceAsync(document, step, acted, nextAssignees, ct);
    }

    /// <summary>Moves to the next step, or completes the document when there is none.</summary>
    private async Task AdvanceAsync(
        Document document,
        WorkflowStep currentStep,
        WorkflowRouting acted,
        IReadOnlyList<Guid>? nextAssignees,
        CancellationToken ct)
    {
        var nextStep = await db.WorkflowSteps
            .Where(s => s.WorkflowDefinitionId == currentStep.WorkflowDefinitionId
                        && s.Order > currentStep.Order)
            .OrderBy(s => s.Order)
            .FirstOrDefaultAsync(ct);

        if (nextStep is null)
        {
            document.Status = DocumentStatus.Approved;
            document.CurrentStepId = null;
            document.ClosedAt = DateTimeOffset.UtcNow;
            document.UpdatedAt = DateTimeOffset.UtcNow;

            audit.Record(AuditActions.DocumentCompleted, AuditEntityType.Document, document.Id,
                new { FinalStep = currentStep.Name });

            logger.LogInformation("Document {DocumentId} completed its workflow", document.Id);
            return;
        }

        document.CurrentStepId = nextStep.Id;
        document.Status = DocumentStatus.Pending;
        document.UpdatedAt = DateTimeOffset.UtcNow;

        // Always fills the next step. For a runtime-choice step this consumes the recipients
        // supplied with the decision, and throws if none were — a document must never come
        // to rest on a step with nobody assigned to it.
        //
        // returnedFrom stays null: this is forward movement. Only ReturnToSenderAsync sets
        // it, and it is what marks a routing as a bounce-back in the inbox and the trail.
        await CreateAssignmentsAsync(
            document,
            nextStep,
            chosenAssignees: nextAssignees,
            routedById: acted.AssignedToId,
            note: null,
            returnedFrom: null,
            ct);

        audit.Record(AuditActions.DocumentRouted, AuditEntityType.Workflow, document.Id,
            new { From = currentStep.Name, To = nextStep.Name });
    }

    /// <summary>
    /// Creates the routings for a step, resolving who must act from the step's
    /// <see cref="StepAssignmentMode"/>.
    /// </summary>
    public async Task CreateAssignmentsAsync(
        Document document,
        WorkflowStep step,
        IReadOnlyList<Guid>? chosenAssignees,
        Guid routedById,
        string? note,
        Guid? returnedFrom,
        CancellationToken ct = default)
    {
        var assignees = await ResolveAssigneesAsync(step, chosenAssignees, ct);

        if (assignees.Count == 0)
        {
            throw new DomainRuleException(
                $"Step '{step.Name}' resolved to nobody. Check the step's configuration " +
                "or choose a recipient.");
        }

        var due = await DueDateForAsync(step, ct);

        foreach (var assigneeId in assignees.Distinct())
        {
            db.WorkflowRoutings.Add(new WorkflowRouting
            {
                DocumentId = document.Id,
                WorkflowStepId = step.Id,
                DepartmentId = await DepartmentForAsync(step, assigneeId, ct),
                AssignedToId = assigneeId,
                RoutedById = routedById,
                Priority = step.DefaultPriority,
                Status = RoutingStatus.Pending,
                Note = note,
                ReturnedFromRoutingId = returnedFrom,
                DueDate = due,
            });
        }
    }

    private async Task<IReadOnlyList<Guid>> ResolveAssigneesAsync(
        WorkflowStep step,
        IReadOnlyList<Guid>? chosen,
        CancellationToken ct) => step.AssignmentMode switch
        {
            StepAssignmentMode.User =>
                step.AssigneeId is { } id ? [id] : [],

            StepAssignmentMode.Department =>
                await db.Users
                    .Where(u => u.DepartmentId == step.DepartmentId && u.IsActive)
                    .Select(u => u.Id)
                    .ToListAsync(ct),

            StepAssignmentMode.Role =>
                await db.UserRoles
                    .Where(ur => ur.RoleId == step.RoleId)
                    .Join(db.Users.Where(u => u.IsActive), ur => ur.UserId, u => u.Id, (_, u) => u.Id)
                    .ToListAsync(ct),

            StepAssignmentMode.ChosenAtRuntime =>
                await ValidateChosenAsync(step, chosen, ct),

            _ => [],
        };

    /// <summary>
    /// Checks a runtime choice: the users must exist, be active, and — when the step names a
    /// department — belong to it. Without this a caller could route a document to anyone.
    /// </summary>
    private async Task<IReadOnlyList<Guid>> ValidateChosenAsync(
        WorkflowStep step,
        IReadOnlyList<Guid>? chosen,
        CancellationToken ct)
    {
        if (chosen is null || chosen.Count == 0)
        {
            throw new DomainRuleException(
                $"Step '{step.Name}' needs a recipient to be chosen.");
        }

        var query = db.Users.Where(u => chosen.Contains(u.Id) && u.IsActive);

        if (step.DepartmentId is { } departmentId)
        {
            query = query.Where(u => u.DepartmentId == departmentId);
        }

        var valid = await query.Select(u => u.Id).ToListAsync(ct);

        var rejected = chosen.Except(valid).ToList();
        if (rejected.Count > 0)
        {
            throw new DomainRuleException(
                "One or more chosen recipients are inactive, do not exist, or are outside " +
                $"the department step '{step.Name}' is restricted to.");
        }

        return valid;
    }

    /// <summary>
    /// Closes sibling assignments at a step that is no longer live, so they stop appearing
    /// in other people's inboxes.
    /// </summary>
    private async Task WithdrawSiblingsAsync(Guid documentId, Guid stepId, Guid keepId, CancellationToken ct) =>
        await db.WorkflowRoutings
            .Where(r => r.DocumentId == documentId
                        && r.WorkflowStepId == stepId
                        && r.Id != keepId
                        && r.Status == RoutingStatus.Pending)
            .ExecuteUpdateAsync(set => set
                .SetProperty(r => r.Status, RoutingStatus.Withdrawn)
                .SetProperty(r => r.ActedAt, DateTimeOffset.UtcNow), ct);

    private async Task<Guid?> DepartmentOfAsync(Guid userId, CancellationToken ct) =>
        await db.Users.Where(u => u.Id == userId).Select(u => u.DepartmentId).FirstOrDefaultAsync(ct);

    /// <summary>
    /// The department a routing is filed under: the step's own, else the assignee's.
    /// </summary>
    private async Task<Guid> DepartmentForAsync(WorkflowStep step, Guid assigneeId, CancellationToken ct)
    {
        if (step.DepartmentId is { } stepDepartment)
        {
            return stepDepartment;
        }

        return await DepartmentOfAsync(assigneeId, ct)
            ?? throw new DomainRuleException(
                "The recipient belongs to no department, and the step does not name one. " +
                "Assign the user to a department or configure the step.");
    }

    /// <summary>
    /// The deadline for a new assignment: the step's own period, or the organisation's
    /// default from Settings when the step sets none. Null when neither applies.
    /// </summary>
    private async Task<DateTimeOffset?> DueDateForAsync(WorkflowStep step, CancellationToken ct)
    {
        var days = step.DueAfterDays ?? (await settings.GetAsync(ct)).DefaultDueDays;
        return days is { } d ? DateTimeOffset.UtcNow.AddDays(d) : null;
    }
}
