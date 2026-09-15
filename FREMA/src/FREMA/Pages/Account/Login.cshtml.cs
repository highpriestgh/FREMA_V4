using System.ComponentModel.DataAnnotations;
using Duende.IdentityServer.Services;
using FREMA.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace FREMA.Pages.Account;

/// <summary>
/// Interactive sign-in for the embedded identity provider.
/// <para>
/// Reached only through IdentityServer's authorize endpoint, which the BFF redirects to.
/// The SPA never sees a password: it calls <c>/bff/login</c> and the browser is handed off
/// to this page.
/// </para>
/// </summary>
[AllowAnonymous]
public class LoginModel(
    SignInManager<ApplicationUser> signInManager,
    UserManager<ApplicationUser> userManager,
    IIdentityServerInteractionService interaction,
    ILogger<LoginModel> logger) : PageModel
{
    [BindProperty]
    public InputModel Input { get; set; } = new();

    public class InputModel
    {
        [Required]
        [Display(Name = "Username or email")]
        public string UserName { get; set; } = string.Empty;

        [Required]
        [DataType(DataType.Password)]
        public string Password { get; set; } = string.Empty;

        public bool RememberMe { get; set; }

        public string? ReturnUrl { get; set; }
    }

    public IActionResult OnGet(string? returnUrl = null)
    {
        Input.ReturnUrl = returnUrl;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
    {
        if (!ModelState.IsValid)
        {
            return Page();
        }

        // Accept either username or email, as the legacy login did.
        var user = await userManager.FindByNameAsync(Input.UserName)
                   ?? await userManager.FindByEmailAsync(Input.UserName);

        if (user is not null && user.IsActive)
        {
            // Check the password without signing in. Signing in first and redirecting to a
            // change-password page afterwards would be bypassable: the identity-provider
            // session would already exist, so returning to /bff/login would complete sign-in
            // with no password change at all.
            var result = await signInManager.CheckPasswordSignInAsync(
                user, Input.Password, lockoutOnFailure: true);

            if (result.Succeeded && user.MustChangePassword)
            {
                // A short-lived, single-purpose cookie that proves the password was correct
                // and nothing more. It does not sign the user in — IdentityServer only honours
                // Identity.Application — so the change page is the only way forward.
                await HttpContext.SignInAsync(
                    IdentityConstants.TwoFactorUserIdScheme,
                    ChangePasswordModel.CreatePendingPrincipal(user.Id));

                logger.LogInformation("User {UserId} must change a temporary password", user.Id);
                return RedirectToPage("/Account/ChangePassword", new { returnUrl = Input.ReturnUrl });
            }

            if (result.Succeeded)
            {
                await signInManager.SignInAsync(user, Input.RememberMe);
                logger.LogInformation("User {UserId} signed in", user.Id);

                user.LastLoginAt = DateTimeOffset.UtcNow;
                await userManager.UpdateAsync(user);

                return Redirect(SafeReturnUrl(Input.ReturnUrl));
            }

            if (result.IsLockedOut)
            {
                logger.LogWarning("Locked-out account {UserId} attempted sign-in", user.Id);
                ModelState.AddModelError(string.Empty,
                    "This account is locked. Try again later or contact an administrator.");
                return Page();
            }
        }

        // One message for every failure mode. Distinguishing "no such user" from "wrong
        // password" would confirm which accounts exist; the legacy forgot-password endpoint
        // leaked exactly that, by throwing on an unknown email and succeeding on a known one.
        logger.LogWarning("Failed sign-in attempt for {UserName}", Input.UserName);
        ModelState.AddModelError(string.Empty, "Invalid username or password.");
        return Page();
    }

    /// <summary>
    /// Only follows a return URL that IdentityServer recognises as a legitimate
    /// authorize-request continuation, or a local path. Anything else is an open-redirect
    /// vector and is discarded.
    /// </summary>
    private string SafeReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrEmpty(returnUrl))
        {
            return "/";
        }

        if (interaction.IsValidReturnUrl(returnUrl) || Url.IsLocalUrl(returnUrl))
        {
            return returnUrl;
        }

        logger.LogWarning("Discarded non-local return URL {ReturnUrl}", returnUrl);
        return "/";
    }
}
