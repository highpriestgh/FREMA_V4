using System.Text.Json;
using FREMA.Domain;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;

namespace FREMA.Infrastructure.Auditing;

/// <summary>
/// Writes the audit trail.
/// <para>
/// Server-side only, and never exposed as an endpoint a client can post to. The prototype
/// logged from the browser, which meant the trail recorded whatever the client chose to
/// report — and omitted whatever it chose not to.
/// </para>
/// <para>
/// Entries are added to the caller's <see cref="FremaDbContext"/> but not saved: the audit
/// row commits in the same transaction as the change it describes, so the two cannot
/// diverge.
/// </para>
/// </summary>
public interface IAuditService
{
    void Record(
        string action,
        AuditEntityType entityType,
        Guid? entityId = null,
        object? details = null);
}

public sealed class AuditService(
    FremaDbContext db,
    ICurrentUser currentUser,
    IHttpContextAccessor httpContextAccessor) : IAuditService
{
    public void Record(
        string action,
        AuditEntityType entityType,
        Guid? entityId = null,
        object? details = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Details = details is null ? null : JsonSerializer.Serialize(details),
            UserId = currentUser.UserId,

            // Denormalised so the entry stays readable after the user is removed.
            UserName = currentUser.UserName,

            IpAddress = httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString(),
        });
    }
}

/// <summary>Canonical audit action names, so the trail is queryable rather than free text.</summary>
public static class AuditActions
{
    public const string DocumentCreated = "document.created";
    public const string DocumentUpdated = "document.updated";
    public const string DocumentDeleted = "document.deleted";
    public const string DocumentSubmitted = "document.submitted";
    public const string DocumentApproved = "document.approved";
    public const string DocumentRejected = "document.rejected";
    public const string DocumentReviewed = "document.reviewed";
    public const string DocumentReturned = "document.returned";
    public const string DocumentCompleted = "document.completed";
    public const string DocumentAbandoned = "document.abandoned";
    public const string DocumentRouted = "document.routed";
    public const string DocumentContentUploaded = "document.content.uploaded";
    public const string DocumentContentDeleted = "document.content.deleted";
    public const string DocumentContentDownloaded = "document.content.downloaded";
    public const string CommentAdded = "comment.added";
}
