using System.ComponentModel.DataAnnotations;
using FREMA.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace FREMA.Pages.Account;

/// <summary>
/// Interactive sign-in. Success sets the application's session cookie.
/// <para>
/// The SPA never sees a password: when it has no session it sends the browser here, with the
/// page it was on as the return URL.
/// </para>
/// </summary>
[AllowAnonymous]
public class LoginModel(
    SignInManager<ApplicationUser> signInManager,
    UserManager<ApplicationUser> userManager,
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
            // change-password page afterwards would be bypassable: the session would already
            // exist, so simply opening the app would skip the password change.
            var result = await signInManager.CheckPasswordSignInAsync(
                user, Input.Password, lockoutOnFailure: true);

            if (result.Succeeded && user.MustChangePassword)
            {
                // A short-lived, single-purpose cookie that proves the password was correct
                // and nothing more. It does not sign the user in — only Identity.Application
                // does — so the change page is the only way forward.
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
    /// Only follows a local return URL. Anything else is an open-redirect vector and is
    /// discarded.
    /// </summary>
    private string SafeReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrEmpty(returnUrl))
        {
            return "/";
        }

        if (Url.IsLocalUrl(returnUrl))
        {
            return returnUrl;
        }

        logger.LogWarning("Discarded non-local return URL {ReturnUrl}", returnUrl);
        return "/";
    }
}
