using Duende.Bff;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Reports;

public sealed record ReportDto(
    DateTimeOffset From,
    DateTimeOffset To,
    ReportSummaryDto Summary,
    IReadOnlyList<DepartmentPerformanceDto> ByDepartment,
    IReadOnlyList<StepPerformanceDto> ByStep,
    IReadOnlyList<AgingBucketDto> Aging,
    IReadOnlyList<TrendPointDto> Trend);

public sealed record ReportSummaryDto(
    int Created,
    int Completed,
    int Abandoned,
    int OpenNow,
    int OverdueNow,
    double? AverageTurnaroundHours,
    double? MedianTurnaroundHours);

/// <summary>How a department handles the assignments that reach it.</summary>
public sealed record DepartmentPerformanceDto(
    string Department,
    int Acted,
    int Approved,
    int Returned,
    double? AverageHoursToAct,
    int PendingNow,
    int OverdueNow);

/// <summary>Where time is spent: the slowest steps are the bottlenecks.</summary>
public sealed record StepPerformanceDto(
    string Workflow,
    string Step,
    int Acted,
    double? AverageHoursToAct,
    int Returned);

public sealed record AgingBucketDto(string Label, int Count);

public sealed record TrendPointDto(DateOnly Date, int Created, int Completed);

public static class ReportEndpoints
{
    /// <summary>Longer ranges are clamped; a year of daily points is already plenty to draw.</summary>
    private const int MaxRangeDays = 366;

    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var reports = app.MapGet("/api/reports", GetAsync)
            .WithTags("Reports")
            .RequireAuthorization(Permissions.ViewReports);
        reports.AsBffApiEndpoint();

        return app;
    }

    /// <summary>
    /// Throughput, turnaround and bottlenecks over a date range.
    /// <para>
    /// Aggregates only — no document titles or contents — so the report can be offered to
    /// people who could not open the documents it counts.
    /// </para>
    /// </summary>
    private static async Task<Ok<ReportDto>> GetAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        FremaDbContext db,
        CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var end = to ?? now;
        var start = from ?? end.AddDays(-30);

        if (start > end)
        {
            throw new DomainRuleException("The start of the range must be before its end.");
        }

        if ((end - start).TotalDays > MaxRangeDays)
        {
            start = end.AddDays(-MaxRangeDays);
        }

        var documents = db.Documents.AsNoTracking();
        var routings = db.WorkflowRoutings.AsNoTracking();

        // --- Summary ---------------------------------------------------------

        var created = await documents.CountAsync(d => d.CreatedAt >= start && d.CreatedAt <= end, ct);

        var closedInRange = documents.Where(d => d.ClosedAt != null && d.ClosedAt >= start && d.ClosedAt <= end);
        var completed = await closedInRange.CountAsync(d => d.Status == DocumentStatus.Approved, ct);
        var abandoned = await closedInRange.CountAsync(d => d.Status == DocumentStatus.Rejected, ct);

        var openNow = await documents.CountAsync(
            d => d.Status == DocumentStatus.Pending || d.Status == DocumentStatus.Returned, ct);

        var overdueNow = await routings.CountAsync(
            r => r.Status == RoutingStatus.Pending && r.DueDate != null && r.DueDate < now, ct);

        // Turnaround is measured in minutes by the database and turned into hours here. The
        // median needs the individual values, so they are fetched — bounded by the range.
        var turnaroundMinutes = await closedInRange
            .Where(d => d.Status == DocumentStatus.Approved)
            .Select(d => EF.Functions.DateDiffMinute(d.CreatedAt, d.ClosedAt!.Value))
            .ToListAsync(ct);

        var summary = new ReportSummaryDto(
            created,
            completed,
            abandoned,
            openNow,
            overdueNow,
            turnaroundMinutes.Count == 0 ? null : Math.Round(turnaroundMinutes.Average() / 60.0, 1),
            Median(turnaroundMinutes) is { } median ? Math.Round(median / 60.0, 1) : null);

        // --- By department -----------------------------------------------------

        var actedInRange = routings.Where(r => r.ActedAt != null && r.ActedAt >= start && r.ActedAt <= end
                                               && r.Status != RoutingStatus.Withdrawn);

        var departmentActivity = await actedInRange
            .GroupBy(r => r.Department.Name)
            .Select(g => new
            {
                Department = g.Key,
                Acted = g.Count(),
                Approved = g.Sum(r => r.Status == RoutingStatus.Approved ? 1 : 0),
                Returned = g.Sum(r => r.Status == RoutingStatus.Rejected ? 1 : 0),
                AverageMinutes = g.Average(r => (double?)EF.Functions.DateDiffMinute(r.RoutedAt, r.ActedAt!.Value)),
            })
            .ToListAsync(ct);

        var departmentBacklog = await routings
            .Where(r => r.Status == RoutingStatus.Pending)
            .GroupBy(r => r.Department.Name)
            .Select(g => new
            {
                Department = g.Key,
                Pending = g.Count(),
                Overdue = g.Sum(r => r.DueDate != null && r.DueDate < now ? 1 : 0),
            })
            .ToListAsync(ct);

        var byDepartment = departmentActivity.Select(a => a.Department)
            .Union(departmentBacklog.Select(b => b.Department))
            .Select(name =>
            {
                var activity = departmentActivity.FirstOrDefault(a => a.Department == name);
                var backlog = departmentBacklog.FirstOrDefault(b => b.Department == name);

                return new DepartmentPerformanceDto(
                    name,
                    activity?.Acted ?? 0,
                    activity?.Approved ?? 0,
                    activity?.Returned ?? 0,
                    activity?.AverageMinutes is { } minutes ? Math.Round(minutes / 60.0, 1) : null,
                    backlog?.Pending ?? 0,
                    backlog?.Overdue ?? 0);
            })
            .OrderByDescending(d => d.PendingNow)
            .ThenByDescending(d => d.Acted)
            .ToList();

        // --- By step -----------------------------------------------------------

        var stepRows = await actedInRange
            .GroupBy(r => new { Workflow = r.WorkflowStep.WorkflowDefinition.Name, Step = r.WorkflowStep.Name })
            .Select(g => new
            {
                g.Key.Workflow,
                g.Key.Step,
                Acted = g.Count(),
                Returned = g.Sum(r => r.Status == RoutingStatus.Rejected ? 1 : 0),
                AverageMinutes = g.Average(r => (double?)EF.Functions.DateDiffMinute(r.RoutedAt, r.ActedAt!.Value)),
            })
            .ToListAsync(ct);

        // Slowest first: the point of this table is to show where documents wait.
        var byStep = stepRows
            .Select(s => new StepPerformanceDto(
                s.Workflow,
                s.Step,
                s.Acted,
                s.AverageMinutes is { } minutes ? Math.Round(minutes / 60.0, 1) : null,
                s.Returned))
            .OrderByDescending(s => s.AverageHoursToAct ?? 0)
            .ToList();

        // --- Aging of open documents ---------------------------------------------

        var openAges = await documents
            .Where(d => d.Status == DocumentStatus.Pending || d.Status == DocumentStatus.Returned)
            .Select(d => EF.Functions.DateDiffDay(d.CreatedAt, now))
            .ToListAsync(ct);

        var aging = new List<AgingBucketDto>
        {
            new("Under 3 days", openAges.Count(days => days < 3)),
            new("3–7 days", openAges.Count(days => days is >= 3 and < 7)),
            new("1–2 weeks", openAges.Count(days => days is >= 7 and < 14)),
            new("2–4 weeks", openAges.Count(days => days is >= 14 and < 28)),
            new("Over 4 weeks", openAges.Count(days => days >= 28)),
        };

        // --- Daily trend ---------------------------------------------------------
        // Bucketed in memory: grouping a DateTimeOffset by calendar day does not translate
        // reliably, and the range is capped, so the rows fetched are bounded.

        var createdDates = await documents
            .Where(d => d.CreatedAt >= start && d.CreatedAt <= end)
            .Select(d => d.CreatedAt)
            .ToListAsync(ct);

        var completedDates = await closedInRange
            .Where(d => d.Status == DocumentStatus.Approved)
            .Select(d => d.ClosedAt!.Value)
            .ToListAsync(ct);

        var createdByDay = createdDates.GroupBy(d => DateOnly.FromDateTime(d.UtcDateTime)).ToDictionary(g => g.Key, g => g.Count());
        var completedByDay = completedDates.GroupBy(d => DateOnly.FromDateTime(d.UtcDateTime)).ToDictionary(g => g.Key, g => g.Count());

        var trend = new List<TrendPointDto>();
        for (var day = DateOnly.FromDateTime(start.UtcDateTime); day <= DateOnly.FromDateTime(end.UtcDateTime); day = day.AddDays(1))
        {
            trend.Add(new TrendPointDto(day, createdByDay.GetValueOrDefault(day), completedByDay.GetValueOrDefault(day)));
        }

        return TypedResults.Ok(new ReportDto(start, end, summary, byDepartment, byStep, aging, trend));
    }

    private static double? Median(List<int> values)
    {
        if (values.Count == 0)
        {
            return null;
        }

        var sorted = values.Order().ToList();
        var middle = sorted.Count / 2;

        return sorted.Count % 2 == 1
            ? sorted[middle]
            : (sorted[middle - 1] + sorted[middle]) / 2.0;
    }
}
