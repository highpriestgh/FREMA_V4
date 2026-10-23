using Microsoft.AspNetCore.Mvc;

namespace FREMA.Infrastructure.Authorization;

/// <summary>
/// The custom-header antiforgery check for SPA API calls.
/// <para>
/// The session is an HttpOnly cookie, which the browser attaches to any request to this site —
/// including one a hostile page triggers with a cross-site form post. Such a post cannot set a
/// custom header, so requiring <c>X-CSRF: 1</c> on every state-changing call is what makes the
/// cookie safe to rely on. <c>SameSite=Strict</c> on the cookie is a second, independent layer.
/// </para>
/// <para>
/// Only unsafe methods are checked. GETs change nothing, and checking them would break plain
/// links such as "open this PDF in a new tab", which cannot carry a header.
/// </para>
/// </summary>
public static class AntiforgeryHeader
{
    public const string HeaderName = "X-CSRF";
    public const string HeaderValue = "1";

    /// <summary>Marks the endpoints of a group as SPA API calls that need the header.</summary>
    public static TBuilder RequireAntiforgeryHeader<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.WithMetadata(new RequireAntiforgeryHeaderMetadata());

    /// <summary>
    /// Rejects marked requests that lack the header. Runs after routing, so the endpoint is
    /// known, and before authorization and model binding, so an upload is refused before its
    /// body is read.
    /// </summary>
    public static IApplicationBuilder UseAntiforgeryHeader(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var endpoint = context.GetEndpoint();

            if (endpoint?.Metadata.GetMetadata<RequireAntiforgeryHeaderMetadata>() is not null
                && !HttpMethods.IsGet(context.Request.Method)
                && !HttpMethods.IsHead(context.Request.Method)
                && !HttpMethods.IsOptions(context.Request.Method)
                && context.Request.Headers[HeaderName] != HeaderValue)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsJsonAsync(new ProblemDetails
                {
                    Status = StatusCodes.Status400BadRequest,
                    Title = "Missing antiforgery header",
                    Detail = $"State-changing API calls must send the '{HeaderName}: {HeaderValue}' header.",
                }, options: null, contentType: "application/problem+json");
                return;
            }

            await next(context);
        });

    private sealed class RequireAntiforgeryHeaderMetadata;
}
