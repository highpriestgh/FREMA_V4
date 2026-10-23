using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FREMA.Features.Roles;

public sealed record RoleDto(
    Guid Id,
    string Name,
    string? Description,
    bool IsSystemRole,
    int UserCount,
    IReadOnlyList<string> Permissions);

public sealed record RoleLookupDto(Guid Id, string Name);

public sealed record PermissionDto(Guid Id, string Name, string DisplayName, string? Description, string Category);

public sealed record SaveRoleRequest(string Name, string? Description, IReadOnlyList<string> Permissions);

public static class RoleEndpoints
{
    public static IEndpointRouteBuilder MapRoleEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/roles").WithTags("Roles");
        group.RequireAntiforgeryHeader();

        group.MapGet("/", ListAsync).RequireAuthorization(Permissions.ManageRoles);

        // Names only, for pickers: assigning a role to a user or to a workflow step should not
        // require the right to redefine what roles are allowed to do.
        group.MapGet("/lookup", async (FremaDbContext db, CancellationToken ct) =>
            TypedResults.Ok(await db.Roles.AsNoTracking()
                .OrderBy(r => r.Name)
                .Select(r => new RoleLookupDto(r.Id, r.Name!))
                .ToListAsync(ct)))
            .RequireAuthorization();
        group.MapGet("/{id:guid}", GetAsync).RequireAuthorization(Permissions.ManageRoles);
        group.MapPost("/", CreateAsync).RequireAuthorization(Permissions.ManageRoles);
        group.MapPut("/{id:guid}", UpdateAsync).RequireAuthorization(Permissions.ManageRoles);
        group.MapDelete("/{id:guid}", DeleteAsync).RequireAuthorization(Permissions.ManageRoles);

        var permissions = app.MapGet("/api/permissions", ListPermissionsAsync)
            .WithTags("Roles")
            .RequireAuthorization(Permissions.ManageRoles);
        permissions.RequireAntiforgeryHeader();

        return app;
    }

    private static async Task<Ok<IReadOnlyList<RoleDto>>> ListAsync(
        FremaDbContext db, CancellationToken ct)
    {
        var roles = await db.Roles.AsNoTracking()
            .OrderBy(r => r.Name)
            .Select(r => new RoleDto(
                r.Id,
                r.Name!,
                r.Description,
                r.IsSystemRole,
                db.UserRoles.Count(ur => ur.RoleId == r.Id),
                db.RolePermissions.Where(rp => rp.RoleId == r.Id)
                    .Join(db.Permissions, rp => rp.PermissionId, p => p.Id, (_, p) => p.Name)
                    .ToList()))
            .ToListAsync(ct);

        return TypedResults.Ok<IReadOnlyList<RoleDto>>(roles);
    }

    private static async Task<Ok<RoleDto>> GetAsync(Guid id, FremaDbContext db, CancellationToken ct) =>
        TypedResults.Ok(await LoadAsync(db, id, ct));

    private static async Task<Ok<IReadOnlyList<PermissionDto>>> ListPermissionsAsync(
        FremaDbContext db, CancellationToken ct)
    {
        var permissions = await db.Permissions.AsNoTracking()
            .OrderBy(p => p.Category).ThenBy(p => p.DisplayName)
            .Select(p => new PermissionDto(p.Id, p.Name, p.DisplayName, p.Description, p.Category))
            .ToListAsync(ct);

        return TypedResults.Ok<IReadOnlyList<PermissionDto>>(permissions);
    }

    private static async Task<Created<RoleDto>> CreateAsync(
        SaveRoleRequest request,
        RoleManager<ApplicationRole> roleManager,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var name = Require(request.Name);

        if (await roleManager.RoleExistsAsync(name))
        {
            throw new ConflictException($"Role '{name}' already exists.");
        }

        var role = new ApplicationRole { Name = name, Description = request.Description?.Trim() };

        var created = await roleManager.CreateAsync(role);
        if (!created.Succeeded)
        {
            throw new DomainRuleException(string.Join(" ", created.Errors.Select(e => e.Description)));
        }

        await ApplyPermissionsAsync(db, role.Id, request.Permissions, ct);
        audit.Record("role.created", AuditEntityType.Role, role.Id, new { name, request.Permissions });
        await db.SaveChangesAsync(ct);

        return TypedResults.Created($"/api/roles/{role.Id}", await LoadAsync(db, role.Id, ct));
    }

    private static async Task<Ok<RoleDto>> UpdateAsync(
        Guid id,
        SaveRoleRequest request,
        FremaDbContext db,
        IAuditService audit,
        IMemoryCache cache,
        CancellationToken ct)
    {
        var role = await db.Roles.FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new NotFoundException("Role", id);

        // Built-in roles keep their names — the seeder reconciles against them, and renaming
        // one would silently create a second on the next seed.
        if (!role.IsSystemRole)
        {
            role.Name = Require(request.Name);
            role.NormalizedName = role.Name.ToUpperInvariant();
        }

        role.Description = request.Description?.Trim();

        await ApplyPermissionsAsync(db, id, request.Permissions, ct);
        audit.Record("role.updated", AuditEntityType.Role, id, new { request.Permissions });
        await db.SaveChangesAsync(ct);

        await InvalidateMembersAsync(db, id, cache, ct);

        return TypedResults.Ok(await LoadAsync(db, id, ct));
    }

    private static async Task<NoContent> DeleteAsync(
        Guid id,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var role = await db.Roles.FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new NotFoundException("Role", id);

        if (role.IsSystemRole)
        {
            throw new DomainRuleException($"'{role.Name}' is a built-in role and cannot be deleted.");
        }

        var members = await db.UserRoles.CountAsync(ur => ur.RoleId == id, ct);
        if (members > 0)
        {
            throw new ConflictException(
                $"Role '{role.Name}' is assigned to {members} user(s). Reassign them first.");
        }

        db.Roles.Remove(role);
        audit.Record("role.deleted", AuditEntityType.Role, id, new { role.Name });
        await db.SaveChangesAsync(ct);

        return TypedResults.NoContent();
    }

    /// <summary>Reconciles a role's grants to exactly the set requested.</summary>
    private static async Task ApplyPermissionsAsync(
        FremaDbContext db,
        Guid roleId,
        IReadOnlyList<string> requested,
        CancellationToken ct)
    {
        var known = await db.Permissions.ToDictionaryAsync(p => p.Name, p => p.Id, ct);
        var target = (requested ?? []).Distinct().ToList();

        var unknown = target.Where(name => !known.ContainsKey(name)).ToList();
        if (unknown.Count > 0)
        {
            throw new DomainRuleException($"Unknown permission(s): {string.Join(", ", unknown)}.");
        }

        var targetIds = target.Select(name => known[name]).ToHashSet();
        var current = await db.RolePermissions.Where(rp => rp.RoleId == roleId).ToListAsync(ct);

        db.RolePermissions.RemoveRange(current.Where(rp => !targetIds.Contains(rp.PermissionId)));

        var existing = current.Select(rp => rp.PermissionId).ToHashSet();
        db.RolePermissions.AddRange(targetIds
            .Where(pid => !existing.Contains(pid))
            .Select(pid => new RolePermission { RoleId = roleId, PermissionId = pid }));
    }

    /// <summary>
    /// Drops cached permissions for everyone holding this role, so a revocation applies on
    /// their next request instead of up to five minutes later.
    /// </summary>
    private static async Task InvalidateMembersAsync(
        FremaDbContext db, Guid roleId, IMemoryCache cache, CancellationToken ct)
    {
        var members = await db.UserRoles
            .Where(ur => ur.RoleId == roleId)
            .Select(ur => ur.UserId)
            .ToListAsync(ct);

        foreach (var userId in members)
        {
            PermissionClaimsTransformation.Invalidate(cache, userId);
        }
    }

    private static async Task<RoleDto> LoadAsync(FremaDbContext db, Guid id, CancellationToken ct)
    {
        var role = await db.Roles.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new NotFoundException("Role", id);

        var permissions = await db.RolePermissions.Where(rp => rp.RoleId == id)
            .Join(db.Permissions, rp => rp.PermissionId, p => p.Id, (_, p) => p.Name)
            .OrderBy(name => name)
            .ToListAsync(ct);

        var users = await db.UserRoles.CountAsync(ur => ur.RoleId == id, ct);

        return new RoleDto(role.Id, role.Name!, role.Description, role.IsSystemRole, users, permissions);
    }

    private static string Require(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new DomainRuleException("A role name is required.")
            : value.Trim();
}
