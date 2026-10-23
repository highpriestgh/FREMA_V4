using System.Security.Claims;
using FREMA.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace FREMA.Infrastructure.Authorization;

/// <summary>
/// ASP.NET Identity's sign-in manager, made aware of <see cref="ApplicationUser.IsActive"/>.
/// <para>
/// Identity knows nothing of the flag, so deactivating someone used to leave their session
/// running: the cookie slides for as long as they keep using the app. Here a deactivated
/// account cannot sign in, and an existing session is rejected the next time the cookie is
/// revalidated — within <c>SecurityStampValidatorOptions.ValidationInterval</c>, set in
/// Program.cs. That holds however the account was deactivated, through the Users page or
/// directly in the database.
/// </para>
/// </summary>
public sealed class FremaSignInManager(
    UserManager<ApplicationUser> userManager,
    IHttpContextAccessor contextAccessor,
    IUserClaimsPrincipalFactory<ApplicationUser> claimsFactory,
    IOptions<IdentityOptions> optionsAccessor,
    ILogger<SignInManager<ApplicationUser>> logger,
    IAuthenticationSchemeProvider schemes,
    IUserConfirmation<ApplicationUser> confirmation)
    : SignInManager<ApplicationUser>(
        userManager, contextAccessor, claimsFactory, optionsAccessor, logger, schemes, confirmation)
{
    public override async Task<bool> CanSignInAsync(ApplicationUser user) =>
        user.IsActive && await base.CanSignInAsync(user);

    public override async Task<ApplicationUser?> ValidateSecurityStampAsync(ClaimsPrincipal? principal)
    {
        var user = await base.ValidateSecurityStampAsync(principal);

        if (user is { IsActive: false })
        {
            Logger.LogWarning("Ended the session of deactivated user {UserId}", user.Id);
            return null;
        }

        return user;
    }
}
