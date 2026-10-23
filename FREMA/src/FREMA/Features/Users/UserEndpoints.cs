using System.Security.Cryptography;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FREMA.Features.Users;

public sealed record UserDto(
    Guid Id,
    string UserName,
    string Email,
    string FirstName,
    string LastName,
    string FullName,
    Guid? DepartmentId,
    string? Department,
    IReadOnlyList<string> Roles,
    bool IsActive,
    bool MustChangePassword,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt);

/// <summary>A person who can be picked as a workflow recipient.</summary>
public sealed record UserLookupDto(
    Guid Id,
    string FullName,
    string Email,
    Guid? DepartmentId,
    string? Department);

/// <summary>The signed-in user's own profile, including resolved permissions.</summary>
public sealed record ProfileDto(
    Guid Id,
    string UserName,
    string Email,
    string FullName,
    Guid? DepartmentId,
    string? Department,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions,
    bool MustChangePassword);

public sealed record CreateUserRequest(
    string Email,
    string FirstName,
    string LastName,
    Guid? DepartmentId,
    IReadOnlyList<string> Roles,
    string? Password);

public sealed record UpdateUserRequest(
    string FirstName,
    string LastName,
    Guid? DepartmentId,
    IReadOnlyList<string> Roles,
    bool IsActive);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

/// <summary>The one-time password for a newly created account.</summary>
public sealed record CreatedUserDto(UserDto User, string? TemporaryPassword);

public static class UserEndpoints
{
    public static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users").WithTags("Users");
        group.RequireAntiforgeryHeader();

        group.MapGet("/", ListAsync).RequireAuthorization(Permissions.ManageUsers);

        // Deliberately open to any signed-in user: choosing a recipient is an ordinary part
        // of routing a document, so it cannot require the administration permission. It
        // returns names and departments only — never roles, status or login history.
        group.MapGet("/lookup", LookupAsync).RequireAuthorization();

        group.MapGet("/me", MeAsync).RequireAuthorization();
        group.MapPost("/me/password", ChangeOwnPasswordAsync).RequireAuthorization();

        group.MapGet("/{id:guid}", GetAsync).RequireAuthorization(Permissions.ManageUsers);
        group.MapPost("/", CreateAsync).RequireAuthorization(Permissions.ManageUsers);
        group.MapPut("/{id:guid}", UpdateAsync).RequireAuthorization(Permissions.ManageUsers);

        return app;
    }

    private static async Task<Ok<PagedResult<UserDto>>> ListAsync(
        string? q,
        Guid? departmentId,
        bool? includeInactive,
        [AsParameters] PageRequest page,
        FremaDbContext db,
        CancellationToken ct)
    {
        var query = db.Users.AsNoTracking();

        if (includeInactive is not true)
        {
            query = query.Where(u => u.IsActive);
        }

        if (departmentId is { } department)
        {
            query = query.Where(u => u.DepartmentId == department);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(u => EF.Functions.Like(u.FirstName, $"%{term}%")
                                     || EF.Functions.Like(u.LastName, $"%{term}%")
                                     || EF.Functions.Like(u.Email!, $"%{term}%"));
        }

        var result = await query
            .OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
            .Select(u => new UserDto(
                u.Id,
                u.UserName!,
                u.Email!,
                u.FirstName,
                u.LastName,
                u.FirstName + " " + u.LastName,
                u.DepartmentId,
                u.Department!.Name,
                db.UserRoles.Where(ur => ur.UserId == u.Id)
                    .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.Name!)
                    .ToList(),
                u.IsActive,
                u.MustChangePassword,
                u.CreatedAt,
                u.LastLoginAt))
            .ToPagedResultAsync(page, ct);

        return TypedResults.Ok(result);
    }

    private static async Task<Ok<IReadOnlyList<UserLookupDto>>> LookupAsync(
        Guid? departmentId,
        string? q,
        FremaDbContext db,
        CancellationToken ct)
    {
        var query = db.Users.AsNoTracking().Where(u => u.IsActive);

        if (departmentId is { } department)
        {
            query = query.Where(u => u.DepartmentId == department);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(u => EF.Functions.Like(u.FirstName, $"%{term}%")
                                     || EF.Functions.Like(u.LastName, $"%{term}%"));
        }

        var users = await query
            .OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
            .Take(100)
            .Select(u => new UserLookupDto(
                u.Id,
                u.FirstName + " " + u.LastName,
                u.Email!,
                u.DepartmentId,
                u.Department!.Name))
            .ToListAsync(ct);

        return TypedResults.Ok<IReadOnlyList<UserLookupDto>>(users);
    }

    private static async Task<Ok<ProfileDto>> MeAsync(
        FremaDbContext db,
        ICurrentUser currentUser,
        HttpContext http,
        CancellationToken ct)
    {
        var id = currentUser.RequireUserId();

        var user = await db.Users.AsNoTracking()
            .Include(u => u.Department)
            .FirstOrDefaultAsync(u => u.Id == id, ct)
            ?? throw new NotFoundException("User", id);

        var roles = await db.UserRoles.Where(ur => ur.UserId == id)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.Name!)
            .ToListAsync(ct);

        // Read from the claims the session already carries rather than re-querying, so what
        // the client sees is exactly what the authorization policies will enforce.
        var permissions = http.User
            .FindAll(Permissions.ClaimType)
            .Select(c => c.Value)
            .Order()
            .ToList();

        return TypedResults.Ok(new ProfileDto(
            user.Id, user.UserName!, user.Email!, user.FullName,
            user.DepartmentId, user.Department?.Name,
            roles, permissions, user.MustChangePassword));
    }

    private static async Task<Ok<UserDto>> GetAsync(
        Guid id, FremaDbContext db, CancellationToken ct) =>
        TypedResults.Ok(await LoadAsync(db, id, ct));

    private static async Task<Created<CreatedUserDto>> CreateAsync(
        CreateUserRequest request,
        UserManager<ApplicationUser> userManager,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new DomainRuleException("An email address is required.");
        }

        var email = request.Email.Trim();

        if (await userManager.FindByEmailAsync(email) is not null)
        {
            throw new ConflictException($"A user with email '{email}' already exists.");
        }

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            DepartmentId = request.DepartmentId,
            IsActive = true,
            MustChangePassword = true,
        };

        // An administrator may set the first password, but nothing weak is ever defaulted
        // to. The legacy code generated 12 uppercase hex characters and sent them by SMS
        // together with the username.
        var generated = request.Password is null;
        var password = request.Password ?? GeneratePassword();

        var created = await userManager.CreateAsync(user, password);
        if (!created.Succeeded)
        {
            throw new DomainRuleException(
                string.Join(" ", created.Errors.Select(e => e.Description)));
        }

        await ApplyRolesAsync(userManager, user, request.Roles, ct);

        audit.Record("user.created", AuditEntityType.User, user.Id,
            new { user.Email, Roles = request.Roles });
        await db.SaveChangesAsync(ct);

        // Shown once, to the administrator who created the account, and never stored.
        return TypedResults.Created(
            $"/api/users/{user.Id}",
            new CreatedUserDto(await LoadAsync(db, user.Id, ct), generated ? password : null));
    }

    private static async Task<Ok<UserDto>> UpdateAsync(
        Guid id,
        UpdateUserRequest request,
        UserManager<ApplicationUser> userManager,
        FremaDbContext db,
        IAuditService audit,
        IMemoryCache cache,
        ICurrentUser currentUser,
        CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct)
            ?? throw new NotFoundException("User", id);

        // Locking yourself out of the system is trivially done and painful to undo.
        if (id == currentUser.UserId && !request.IsActive)
        {
            throw new DomainRuleException("You cannot deactivate your own account.");
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.DepartmentId = request.DepartmentId;
        user.IsActive = request.IsActive;

        await ApplyRolesAsync(userManager, user, request.Roles, ct);

        audit.Record("user.updated", AuditEntityType.User, id,
            new { request.Roles, request.IsActive });
        await db.SaveChangesAsync(ct);

        // Role changes alter permissions, which are cached for five minutes. Drop the entry
        // so a revocation takes effect on this user's next request rather than later.
        PermissionClaimsTransformation.Invalidate(cache, id);

        return TypedResults.Ok(await LoadAsync(db, id, ct));
    }

    private static async Task<NoContent> ChangeOwnPasswordAsync(
        ChangePasswordRequest request,
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        FremaDbContext db,
        IAuditService audit,
        ICurrentUser currentUser,
        CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(currentUser.RequireUserId().ToString())
            ?? throw new NotFoundException("User", currentUser.RequireUserId());

        var result = await userManager.ChangePasswordAsync(
            user, request.CurrentPassword, request.NewPassword);

        if (!result.Succeeded)
        {
            throw new DomainRuleException(
                string.Join(" ", result.Errors.Select(e => e.Description)));
        }

        user.MustChangePassword = false;
        user.PasswordChangedAt = DateTimeOffset.UtcNow;
        await userManager.UpdateAsync(user);

        audit.Record("user.password.changed", AuditEntityType.User, user.Id);
        await db.SaveChangesAsync(ct);

        // Changing the password rotates the security stamp, which invalidates every session the
        // user holds — including this one, at the next stamp check. Re-issue this one so the
        // person who just changed it stays signed in while their other sessions end.
        await signInManager.RefreshSignInAsync(user);

        return TypedResults.NoContent();
    }

    /// <summary>Reconciles a user's roles to exactly the set requested.</summary>
    private static async Task ApplyRolesAsync(
        UserManager<ApplicationUser> userManager,
        ApplicationUser user,
        IReadOnlyList<string> requested,
        CancellationToken ct)
    {
        var current = await userManager.GetRolesAsync(user);
        var target = requested?.Distinct().ToList() ?? [];

        var toRemove = current.Except(target).ToList();
        var toAdd = target.Except(current).ToList();

        if (toRemove.Count > 0)
        {
            await userManager.RemoveFromRolesAsync(user, toRemove);
        }

        if (toAdd.Count > 0)
        {
            var result = await userManager.AddToRolesAsync(user, toAdd);
            if (!result.Succeeded)
            {
                throw new DomainRuleException(
                    string.Join(" ", result.Errors.Select(e => e.Description)));
            }
        }
    }

    private static async Task<UserDto> LoadAsync(FremaDbContext db, Guid id, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking()
            .Include(u => u.Department)
            .FirstOrDefaultAsync(u => u.Id == id, ct)
            ?? throw new NotFoundException("User", id);

        var roles = await db.UserRoles.Where(ur => ur.UserId == id)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.Name!)
            .ToListAsync(ct);

        return new UserDto(
            user.Id, user.UserName!, user.Email!, user.FirstName, user.LastName, user.FullName,
            user.DepartmentId, user.Department?.Name, roles,
            user.IsActive, user.MustChangePassword, user.CreatedAt, user.LastLoginAt);
    }

    /// <summary>
    /// 20 characters from a 70-character alphabet, drawn without modulo bias — unlike the
    /// legacy <c>GenerateCode</c>, which used <c>b % 36</c> over 256 byte values.
    /// </summary>
    private static string GeneratePassword() =>
        RandomNumberGenerator.GetString(
            "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+", 20);
}
