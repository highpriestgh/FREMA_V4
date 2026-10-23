using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Dashboard;

public sealed record DashboardDto(
    MyWorkDto MyWork,
    IReadOnlyList<StatusCountDto> ByStatus,
    IReadOnlyList<DepartmentLoadDto> ByDepartment,
    IReadOnlyList<ActivityDto> RecentActivity);

/// <summary>What is on the signed-in user's plate.</summary>
public sealed record MyWorkDto(
    int AwaitingMe,
    int OverdueForMe,
    int UrgentForMe,
    int ReturnedToMe,
    int MyDraft,
    int MyInProgress);

public sealed record StatusCountDto(DocumentStatus Status, string Label, int Count);

public sealed record DepartmentLoadDto(string Department, int Pending, int Overdue);

public sealed record ActivityDto(
    string Action,
    string? User,
    Guid? DocumentId,
    string? DocumentTitle,
    DateTimeOffset At);

public static class DashboardEndpoints
{
    public static IEndpointRouteBuilder MapDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        var dashboard = app.MapGet("/api/dashboard", GetAsync)
            .WithTags("Dashboard")
            .RequireAuthorization();
        dashboard.RequireAntiforgeryHeader();

        return app;
    }

    /// <summary>
    /// Aggregates for the landing page.
    /// <para>
    /// Computed in the database. The prototype produced these numbers by loading the whole
    /// mock dataset into the browser and counting it there, which stops working the moment
    /// the data is real.
    /// </para>
    /// </summary>
    private static async Task<Ok<DashboardDto>> GetAsync(
        FremaDbContext db,
        ICurrentUser user,
        CancellationToken ct)
    {
        var userId = user.RequireUserId();
        var now = DateTimeOffset.UtcNow;
        var canSeeEverything = user.HasPermission(Permissions.ViewAllDocuments);

        var mine = db.WorkflowRoutings.AsNoTracking()
            .Where(r => r.AssignedToId == userId && r.Status == RoutingStatus.Pending);

        var myWork = new MyWorkDto(
            AwaitingMe: await mine.CountAsync(ct),
            OverdueForMe: await mine.CountAsync(r => r.DueDate != null && r.DueDate < now, ct),
            UrgentForMe: await mine.CountAsync(r => r.Priority == Priority.Urgent, ct),
            ReturnedToMe: await mine.CountAsync(r => r.ReturnedFromRoutingId != null, ct),
            MyDraft: await db.Documents.CountAsync(
                d => d.UploadedById == userId && d.Status == DocumentStatus.Draft, ct),
            MyInProgress: await db.Documents.CountAsync(
                d => d.UploadedById == userId && d.Status == DocumentStatus.Pending, ct));

        // The same visibility rule the document list uses, so the totals on the dashboard
        // agree with what the user can actually open.
        var documents = db.Documents.AsNoTracking();
        if (!canSeeEverything)
        {
            documents = documents.Where(d => d.UploadedById == userId
                                             || d.Routings.Any(r => r.AssignedToId == userId
                                                                    || r.RoutedById == userId));
        }

        var statusCounts = await documents
            .GroupBy(d => d.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var byStatus = Enum.GetValues<DocumentStatus>()
            .Select(status => new StatusCountDto(
                status,
                status.ToString(),
                statusCounts.FirstOrDefault(c => c.Status == status)?.Count ?? 0))
            .ToList();

        // Departmental load is a management view; it is meaningless when scoped to one
        // person's own documents, so it is omitted rather than shown misleadingly.
        var byDepartment = canSeeEverything
            ? await db.WorkflowRoutings.AsNoTracking()
                .Where(r => r.Status == RoutingStatus.Pending)
                .GroupBy(r => r.Department.Name)
                // Ordered on the aggregate, before projecting. Sorting by a property of the
                // projected record instead leaves EF nothing it can translate.
                .OrderByDescending(g => g.Count())
                // A conditional Sum, not Count(predicate): the latter has no translation
                // inside a grouped projection.
                .Select(g => new DepartmentLoadDto(
                    g.Key,
                    g.Count(),
                    g.Sum(r => r.DueDate != null && r.DueDate < now ? 1 : 0)))
                .ToListAsync(ct)
            : [];

        var recentActivity = user.HasPermission(Permissions.ViewAudit)
            ? await db.AuditLogs.AsNoTracking()
                .OrderByDescending(a => a.Id)
                // Enough for the dashboard to page through, five at a time.
                .Take(50)
                .Select(a => new ActivityDto(
                    a.Action,
                    a.UserName,
                    a.EntityId,
                    db.Documents.Where(d => d.Id == a.EntityId).Select(d => d.Title).FirstOrDefault(),
                    a.CreatedAt))
                .ToListAsync(ct)
            : [];

        return TypedResults.Ok(new DashboardDto(myWork, byStatus, byDepartment, recentActivity));
    }
}
