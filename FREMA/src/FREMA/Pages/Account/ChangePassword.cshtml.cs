using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace FREMA.Pages.Account;

/// <summary>
/// The mandatory password change for an account still on a temporary password.
/// <para>
/// Reached only from the sign-in page, after the temporary password has been checked. Until a
/// new password is set the user holds no session at all — only a five-minute cookie that
/// proves the old password was right — so there is no route into the application that skips
/// this page.
/// </para>
/// </summary>
[AllowAnonymous]
public class ChangePasswordModel(
    UserManager<ApplicationUser> userManager,
    SignInManager<ApplicationUser> signInManager,
    FremaDbContext db,
    ILogger<ChangePasswordModel> logger) : PageModel
{
    private const string PurposeClaim = "frema:purpose";
    private const string Purpose = "password-change";

    [BindProperty]
    public InputModel Input { get; set; } = new();

    public class InputModel
    {
        [Required]
        [DataType(DataType.Password)]
        [Display(Name = "New password")]
        public string NewPassword { get; set; } = string.Empty;

        [Required]
        [DataType(DataType.Password)]
        [Display(Name = "Confirm new password")]
        [Compare(nameof(NewPassword), ErrorMessage = "The two passwords do not match.")]
        public string ConfirmPassword { get; set; } = string.Empty;

        public string? ReturnUrl { get; set; }
    }

    /// <summary>The proof-of-password principal the sign-in page issues.</summary>
    public static ClaimsPrincipal CreatePendingPrincipal(Guid userId) =>
        new(new ClaimsIdentity(
            [
                new Claim(ClaimTypes.Name, userId.ToString()),
                new Claim(PurposeClaim, Purpose),
            ],
            IdentityConstants.TwoFactorUserIdScheme));

    public async Task<IActionResult> OnGetAsync(string? returnUrl = null, bool throttled = false)
    {
        if (await PendingUserAsync() is null)
        {
            return RedirectToPage("/Account/Login", new { returnUrl, throttled = throttled ? true : (bool?)null });
        }

        if (throttled)
        {
            ModelState.AddModelError(string.Empty, LoginModel.ThrottledMessage);
        }

        Input.ReturnUrl = returnUrl;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
    {
        var user = await PendingUserAsync();
        if (user is null)
        {
            // The five-minute window lapsed, or the page was opened directly.
            return RedirectToPage("/Account/Login", new { returnUrl = Input.ReturnUrl });
        }

        if (!ModelState.IsValid)
        {
            return Page();
        }

        if (await userManager.CheckPasswordAsync(user, Input.NewPassword))
        {
            ModelState.AddModelError(string.Empty, "Choose a password different from the temporary one.");
            return Page();
        }

        // The current password was verified moments ago on the sign-in page, so a reset token
        // is used rather than asking for it again. ResetPasswordAsync still runs every
        // password validator and rotates the security stamp.
        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        var result = await userManager.ResetPasswordAsync(user, token, Input.NewPassword);

        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }
            return Page();
        }

        var now = DateTimeOffset.UtcNow;
        user.MustChangePassword = false;
        user.PasswordChangedAt = now;
        user.LastLoginAt = now;
        await userManager.UpdateAsync(user);

        // Written directly: nobody is signed in yet, so the request-scoped audit service would
        // record an anonymous actor.
        db.AuditLogs.Add(new AuditLog
        {
            Action = "user.password.changed",
            EntityType = AuditEntityType.User,
            EntityId = user.Id,
            UserId = user.Id,
            UserName = user.UserName,
            Details = """{"reason":"temporary password replaced at sign-in"}""",
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
        });
        await db.SaveChangesAsync();

        await HttpContext.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
        await signInManager.SignInAsync(user, isPersistent: false);

        logger.LogInformation("User {UserId} replaced a temporary password and signed in", user.Id);
        return Redirect(SafeReturnUrl(Input.ReturnUrl));
    }

    /// <summary>The user proven by the pending cookie, or null if there is no valid one.</summary>
    private async Task<ApplicationUser?> PendingUserAsync()
    {
        var result = await HttpContext.AuthenticateAsync(IdentityConstants.TwoFactorUserIdScheme);

        if (!result.Succeeded
            || result.Principal.FindFirstValue(PurposeClaim) != Purpose
            || result.Principal.FindFirstValue(ClaimTypes.Name) is not { } id)
        {
            return null;
        }

        var user = await userManager.FindByIdAsync(id);

        // Re-checked, not assumed: an account deactivated, or already changed in another tab,
        // must not proceed on a cookie issued before that happened.
        return user is { IsActive: true, MustChangePassword: true } ? user : null;
    }

    private string SafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl)
            ? returnUrl
            : "/";
}
