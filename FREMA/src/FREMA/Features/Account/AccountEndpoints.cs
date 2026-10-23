using FREMA.Domain;
using FREMA.Infrastructure.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;

namespace FREMA.Features.Account;

/// <summary>
/// Session endpoints for the SPA. Sign-in itself is the Razor page at <c>/Account/Login</c>,
/// so a password never passes through JavaScript.
/// </summary>
public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/account").WithTags("Account");
        group.RequireAntiforgeryHeader();

        // A POST, not a GET link: with the header check, another site cannot sign people out.
        group.MapPost("/logout", LogoutAsync).RequireAuthorization();

        return app;
    }

    private static async Task<NoContent> LogoutAsync(
        SignInManager<ApplicationUser> signInManager,
        ILogger<SignInManager<ApplicationUser>> logger,
        HttpContext context)
    {
        await signInManager.SignOutAsync();
        logger.LogInformation("User {UserName} signed out", context.User.Identity?.Name);
        return TypedResults.NoContent();
    }
}
