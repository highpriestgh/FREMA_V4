using System.Security.Claims;
using FREMA.Domain;

namespace FREMA.Infrastructure.Authorization;

/// <summary>
/// The signed-in user, read from the session cookie.
/// <para>
/// Replaces the legacy pattern of calling
/// <c>Guid.Parse(HttpContext.User.Claims.FirstOrDefault(...)?.Value)</c> inline in every
/// action, which threw on a null or malformed subject claim and produced a 500. The base
/// controller that would have centralised it existed but was commented out in its entirety.
/// </para>
/// </summary>
public interface ICurrentUser
{
    /// <summary>The user's id, or null when the request is anonymous or the claim is unusable.</summary>
    Guid? UserId { get; }

    bool IsAuthenticated { get; }

    string? UserName { get; }

    /// <summary>True when the user holds the given permission. See <see cref="Permissions"/>.</summary>
    bool HasPermission(string permission);

    /// <summary>The user's id, or throws when there is none. Use only where auth is guaranteed.</summary>
    Guid RequireUserId();
}

/// <summary>
/// Reads FREMA's claims off a principal directly, for the places that have a
/// <see cref="ClaimsPrincipal"/> but no request scope — authorization handlers, most of all.
/// </summary>
public static class ClaimsPrincipalExtensions
{
    /// <summary>The user's id, or null when absent or malformed. Never throws.</summary>
    public static Guid? GetUserId(this ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? principal.FindFirstValue("sub");

        return Guid.TryParse(raw, out var id) ? id : null;
    }

    public static bool HasPermission(this ClaimsPrincipal principal, string permission) =>
        principal.HasClaim(Permissions.ClaimType, permission);
}

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    public Guid? UserId
    {
        get
        {
            var raw = Principal?.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? Principal?.FindFirstValue("sub");

            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public string? UserName =>
        Principal?.FindFirstValue(ClaimTypes.Name) ?? Principal?.FindFirstValue("name");

    public bool HasPermission(string permission) =>
        Principal?.HasClaim(Permissions.ClaimType, permission) ?? false;

    public Guid RequireUserId() =>
        UserId ?? throw new InvalidOperationException(
            "No authenticated user on this request. Check the endpoint's authorization.");
}
