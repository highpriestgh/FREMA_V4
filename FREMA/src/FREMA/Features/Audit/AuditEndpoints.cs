using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Audit;

public sealed record AuditEntryDto(
    long Id,
    string Action,
    AuditEntityType EntityType,
    Guid? EntityId,
    string? Details,
    Guid? UserId,
    string? UserName,
    string? IpAddress,
    DateTimeOffset CreatedAt);

public sealed record NotificationDto(
    Guid Id,
    string Message,
    Guid? DocumentId,
    string? Link,
    bool IsRead,
    DateTimeOffset CreatedAt);

public static class AuditEndpoints
{
    public static IEndpointRouteBuilder MapAuditEndpoints(this IEndpointRouteBuilder app)
    {
        var audit = app.MapGroup("/api/audit").WithTags("Audit");
        audit.RequireAntiforgeryHeader();

        // Read-only by design. There is no write endpoint, and there never should be: the
        // prototype logged from the browser, so the trail recorded whatever the client chose
        // to report. Entries here are written server-side inside the transaction they describe.
        audit.MapGet("/", ListAsync).RequireAuthorization(Permissions.ViewAudit);

        var notifications = app.MapGroup("/api/notifications").WithTags("Notifications");
        notifications.RequireAntiforgeryHeader();

        notifications.MapGet("/", ListNotificationsAsync).RequireAuthorization();
        notifications.MapPost("/{id:guid}/read", MarkReadAsync).RequireAuthorization();
        notifications.MapPost("/read-all", MarkAllReadAsync).RequireAuthorization();

        return app;
    }

    private static async Task<Ok<PagedResult<AuditEntryDto>>> ListAsync(
        string? action,
        AuditEntityType? entityType,
        Guid? entityId,
        Guid? userId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        [AsParameters] PageRequest page,
        FremaDbContext db,
        CancellationToken ct)
    {
        var query = db.AuditLogs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(action))
        {
            var term = action.Trim();
            query = query.Where(a => EF.Functions.Like(a.Action, $"{term}%"));
        }

        if (entityType is { } type) query = query.Where(a => a.EntityType == type);
        if (entityId is { } entity) query = query.Where(a => a.EntityId == entity);
        if (userId is { } actor) query = query.Where(a => a.UserId == actor);
        if (from is { } start) query = query.Where(a => a.CreatedAt >= start);
        if (to is { } end) query = query.Where(a => a.CreatedAt <= end);

        var result = await query
            .OrderByDescending(a => a.Id)
            .Select(a => new AuditEntryDto(
                a.Id, a.Action, a.EntityType, a.EntityId, a.Details,
                a.UserId, a.UserName, a.IpAddress, a.CreatedAt))
            .ToPagedResultAsync(page, ct);

        return TypedResults.Ok(result);
    }

    private static async Task<Ok<PagedResult<NotificationDto>>> ListNotificationsAsync(
        bool? unreadOnly,
        [AsParameters] PageRequest page,
        FremaDbContext db,
        ICurrentUser user,
        CancellationToken ct)
    {
        var userId = user.RequireUserId();

        // Scoped to the caller with no way to widen it: notifications are personal, and a
        // filter parameter would be an invitation to read someone else's.
        var query = db.Notifications.AsNoTracking().Where(n => n.UserId == userId);

        if (unreadOnly is true)
        {
            query = query.Where(n => n.ReadAt == null);
        }

        var result = await query
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new NotificationDto(
                n.Id, n.Message, n.DocumentId, n.Link, n.ReadAt != null, n.CreatedAt))
            .ToPagedResultAsync(page, ct);

        return TypedResults.Ok(result);
    }

    private static async Task<NoContent> MarkReadAsync(
        Guid id,
        FremaDbContext db,
        ICurrentUser user,
        CancellationToken ct)
    {
        var userId = user.RequireUserId();

        // The ownership check is part of the update predicate, so marking someone else's
        // notification read simply matches nothing.
        var affected = await db.Notifications
            .Where(n => n.Id == id && n.UserId == userId && n.ReadAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(n => n.ReadAt, DateTimeOffset.UtcNow), ct);

        if (affected == 0 && !await db.Notifications.AnyAsync(n => n.Id == id && n.UserId == userId, ct))
        {
            throw new NotFoundException("Notification", id);
        }

        return TypedResults.NoContent();
    }

    private static async Task<NoContent> MarkAllReadAsync(
        FremaDbContext db,
        ICurrentUser user,
        CancellationToken ct)
    {
        var userId = user.RequireUserId();

        await db.Notifications
            .Where(n => n.UserId == userId && n.ReadAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(n => n.ReadAt, DateTimeOffset.UtcNow), ct);

        return TypedResults.NoContent();
    }
}
