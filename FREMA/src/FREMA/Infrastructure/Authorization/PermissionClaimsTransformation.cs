using System.Security.Claims;
using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FREMA.Infrastructure.Authorization;

/// <summary>
/// Expands the user's roles into permission claims, which the per-permission authorization
/// policies then check.
/// <para>
/// The legacy system stored roles, permissions and role-permission grants, but read them
/// only to decide which menu items to draw. No endpoint ever consulted them, so the
/// permission model described access it did not enforce.
/// </para>
/// <para>
/// Permissions are resolved from the database and cached briefly. Putting them in the
/// session cookie at sign-in would be cheaper, but a revoked permission would then persist
/// until the user logged out; this way it takes effect within <see cref="CacheDuration"/>.
/// </para>
/// </summary>
public sealed class PermissionClaimsTransformation(
    IServiceScopeFactory scopeFactory,
    IMemoryCache cache)
    : IClaimsTransformation
{
    /// <summary>
    /// Window during which a permission change is not yet visible. Short enough that a
    /// revocation takes effect promptly, long enough to keep this off the hot path.
    /// </summary>
    public static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        if (principal.Identity?.IsAuthenticated is not true)
        {
            return principal;
        }

        // TransformAsync may run more than once per request. Adding claims unconditionally
        // would duplicate them on every pass.
        if (principal.HasClaim(c => c.Type == Permissions.ClaimType))
        {
            return principal;
        }

        var subject = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? principal.FindFirstValue("sub");

        if (!Guid.TryParse(subject, out var userId))
        {
            return principal;
        }

        var permissions = await GetPermissionsAsync(userId);
        if (permissions.Count == 0)
        {
            return principal;
        }

        // Clone rather than mutate: the incoming principal may be cached by the
        // authentication handler and shared across requests.
        var clone = principal.Clone();
        var identity = clone.Identities.First();

        foreach (var permission in permissions)
        {
            identity.AddClaim(new Claim(Permissions.ClaimType, permission));
        }

        return clone;
    }

    private async Task<IReadOnlyList<string>> GetPermissionsAsync(Guid userId)
    {
        var key = $"permissions:{userId}";

        if (cache.TryGetValue(key, out IReadOnlyList<string>? cached) && cached is not null)
        {
            return cached;
        }

        // IClaimsTransformation is a singleton; the DbContext is scoped.
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FremaDbContext>();

        var permissions = await db.UserRoles
            .Where(ur => ur.UserId == userId)
            .Join(db.RolePermissions, ur => ur.RoleId, rp => rp.RoleId, (_, rp) => rp.PermissionId)
            .Join(db.Permissions, id => id, p => p.Id, (_, p) => p.Name)
            .Distinct()
            .ToListAsync();

        cache.Set(key, (IReadOnlyList<string>)permissions, CacheDuration);
        return permissions;
    }

    /// <summary>Drops a user's cached permissions, so a grant or revocation applies at once.</summary>
    public static void Invalidate(IMemoryCache cache, Guid userId) =>
        cache.Remove($"permissions:{userId}");
}
