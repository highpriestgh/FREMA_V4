using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace FREMA.Common;

/// <summary>
/// Base for failures that are part of the domain's vocabulary rather than defects.
/// <para>
/// The legacy code threw bare <c>throw new Exception("Password confirmation must be equal
/// to New Password!")</c> for validation problems, which surfaced as 500s carrying internal
/// text. These map to the status code the situation actually warrants.
/// </para>
/// </summary>
public abstract class DomainException(string message) : Exception(message)
{
    public abstract int StatusCode { get; }
    public abstract string Title { get; }
}

/// <summary>The addressed resource does not exist. 404.</summary>
public sealed class NotFoundException(string resource, object key)
    : DomainException($"{resource} '{key}' was not found.")
{
    public override int StatusCode => StatusCodes.Status404NotFound;
    public override string Title => "Not found";
}

/// <summary>The request is well-formed but breaks a domain rule. 422.</summary>
public sealed class DomainRuleException(string message) : DomainException(message)
{
    public override int StatusCode => StatusCodes.Status422UnprocessableEntity;
    public override string Title => "Rule violation";
}

/// <summary>
/// The caller is authenticated but not permitted to do this to this resource. 403.
/// <para>
/// Deliberately 403 and not 404: the caller has already been shown the document exists by
/// some other route, so hiding it here would only confuse. Where existence itself is
/// sensitive, throw <see cref="NotFoundException"/> instead.
/// </para>
/// </summary>
public sealed class ForbiddenException(string message) : DomainException(message)
{
    public override int StatusCode => StatusCodes.Status403Forbidden;
    public override string Title => "Forbidden";
}

/// <summary>The request conflicts with the resource's current state. 409.</summary>
public sealed class ConflictException(string message) : DomainException(message)
{
    public override int StatusCode => StatusCodes.Status409Conflict;
    public override string Title => "Conflict";
}

/// <summary>
/// Translates <see cref="DomainException"/> into RFC 9457 ProblemDetails, and everything
/// else into an opaque 500 — an unexpected failure must never leak its message to a client.
/// </summary>
public sealed class DomainExceptionHandler(
    IProblemDetailsService problemDetails,
    ILogger<DomainExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context,
        Exception exception,
        CancellationToken ct)
    {
        if (exception is not DomainException domain)
        {
            logger.LogError(exception, "Unhandled exception on {Method} {Path}",
                context.Request.Method, context.Request.Path);
            return false;
        }

        logger.LogInformation("{Title}: {Message}", domain.Title, domain.Message);
        context.Response.StatusCode = domain.StatusCode;

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            Exception = domain,
            ProblemDetails = new ProblemDetails
            {
                Status = domain.StatusCode,
                Title = domain.Title,
                Detail = domain.Message,
            },
        });
    }
}
