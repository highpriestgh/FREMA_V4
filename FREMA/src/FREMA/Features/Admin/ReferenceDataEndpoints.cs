using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Admin;

public sealed record ReferenceItemDto(
    Guid Id,
    string Name,
    string? Description,
    bool IsActive,
    DateTimeOffset CreatedAt,
    int UsageCount);

public sealed record SaveReferenceItemRequest(string Name, string? Description, bool IsActive);

/// <summary>
/// CRUD for the admin-managed lookup tables — departments, document types and origins.
/// <para>
/// Written once against <see cref="IReferenceEntity"/>. The legacy solution had a separate
/// controller, service and set of stored procedures per table, which is why the same
/// null-dereference and missing-paging bugs appear in each of them.
/// </para>
/// </summary>
public static class ReferenceDataEndpoints
{
    public static IEndpointRouteBuilder MapReferenceDataEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapReferenceTable(
            "departments", "Department", Permissions.ManageDepartments,
            db => db.Departments,
            (db, id) => db.Users.CountAsync(u => u.DepartmentId == id),
            name => new Department { Name = name });

        app.MapReferenceTable(
            "document-types", "Document type", Permissions.ManageDocumentTypes,
            db => db.DocumentTypes,
            (db, id) => db.Documents.CountAsync(d => d.DocumentTypeId == id),
            name => new DocumentType { Name = name });

        app.MapReferenceTable(
            "origins", "Origin", Permissions.ManageOrigins,
            db => db.Origins,
            (db, id) => db.Documents.CountAsync(d => d.OriginId == id),
            name => new Origin { Name = name });

        return app;
    }

    /// <param name="usageCount">
    /// How many rows depend on this item. Deleting one that is in use would orphan documents
    /// or users, so it is deactivated instead — the list is history as much as configuration.
    /// </param>
    private static void MapReferenceTable<TEntity>(
        this IEndpointRouteBuilder app,
        string route,
        string label,
        string managePermission,
        Func<FremaDbContext, DbSet<TEntity>> set,
        Func<FremaDbContext, Guid, Task<int>> usageCount,
        Func<string, TEntity> create)
        where TEntity : class, IReferenceEntity
    {
        var group = app.MapGroup($"/api/{route}").WithTags("Reference data");
        group.RequireAntiforgeryHeader();

        // Readable by any signed-in user: pickers on the upload and routing forms need it.
        group.MapGet("/", async (
            bool? includeInactive,
            FremaDbContext db,
            CancellationToken ct) =>
        {
            var query = set(db).AsNoTracking();

            if (includeInactive is not true)
            {
                query = query.Where(e => e.IsActive);
            }

            var items = await query
                .OrderBy(e => e.Name)
                .Select(e => new ReferenceItemDto(
                    e.Id, e.Name, e.Description, e.IsActive, e.CreatedAt, 0))
                .ToListAsync(ct);

            return TypedResults.Ok<IReadOnlyList<ReferenceItemDto>>(items);
        }).RequireAuthorization();

        group.MapGet("/{id:guid}", async (
            Guid id,
            FremaDbContext db,
            CancellationToken ct) =>
        {
            var entity = await set(db).AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct)
                ?? throw new NotFoundException(label, id);

            return TypedResults.Ok(new ReferenceItemDto(
                entity.Id, entity.Name, entity.Description, entity.IsActive, entity.CreatedAt,
                await usageCount(db, id)));
        }).RequireAuthorization();

        group.MapPost("/", async (
            SaveReferenceItemRequest request,
            FremaDbContext db,
            IAuditService audit,
            CancellationToken ct) =>
        {
            var name = Require(request.Name, label);

            if (await set(db).AnyAsync(e => e.Name == name, ct))
            {
                throw new ConflictException($"{label} '{name}' already exists.");
            }

            // A factory rather than new(): these entities have `required` members, which the
            // new() constraint cannot satisfy.
            var entity = create(name);
            entity.Description = request.Description?.Trim();
            entity.IsActive = request.IsActive;

            set(db).Add(entity);
            audit.Record($"{route}.created", AuditEntityType.Role, entity.Id, new { name });
            await db.SaveChangesAsync(ct);

            return TypedResults.Created($"/api/{route}/{entity.Id}", new ReferenceItemDto(
                entity.Id, entity.Name, entity.Description, entity.IsActive, entity.CreatedAt, 0));
        }).RequireAuthorization(managePermission);

        group.MapPut("/{id:guid}", async (
            Guid id,
            SaveReferenceItemRequest request,
            FremaDbContext db,
            IAuditService audit,
            CancellationToken ct) =>
        {
            var entity = await set(db).FirstOrDefaultAsync(e => e.Id == id, ct)
                ?? throw new NotFoundException(label, id);

            var name = Require(request.Name, label);

            if (await set(db).AnyAsync(e => e.Name == name && e.Id != id, ct))
            {
                throw new ConflictException($"{label} '{name}' already exists.");
            }

            entity.Name = name;
            entity.Description = request.Description?.Trim();
            entity.IsActive = request.IsActive;

            audit.Record($"{route}.updated", AuditEntityType.Role, id, new { name });
            await db.SaveChangesAsync(ct);

            return TypedResults.Ok(new ReferenceItemDto(
                entity.Id, entity.Name, entity.Description, entity.IsActive, entity.CreatedAt,
                await usageCount(db, id)));
        }).RequireAuthorization(managePermission);

        group.MapDelete("/{id:guid}", async (
            Guid id,
            FremaDbContext db,
            IAuditService audit,
            CancellationToken ct) =>
        {
            var entity = await set(db).FirstOrDefaultAsync(e => e.Id == id, ct)
                ?? throw new NotFoundException(label, id);

            var inUse = await usageCount(db, id);
            if (inUse > 0)
            {
                throw new ConflictException(
                    $"{label} '{entity.Name}' is used by {inUse} record(s) and cannot be " +
                    "deleted. Deactivate it instead — it will stop appearing in pickers " +
                    "while existing records keep their history.");
            }

            set(db).Remove(entity);
            audit.Record($"{route}.deleted", AuditEntityType.Role, id, new { entity.Name });
            await db.SaveChangesAsync(ct);

            return TypedResults.NoContent();
        }).RequireAuthorization(managePermission);
    }

    private static string Require(string? value, string label) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new DomainRuleException($"{label} name is required.")
            : value.Trim();
}
