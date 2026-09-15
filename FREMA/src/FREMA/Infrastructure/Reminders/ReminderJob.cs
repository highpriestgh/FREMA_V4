using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Settings;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Infrastructure.Reminders;

public sealed record ReminderRunResult(int DueSoon, int Overdue, bool Enabled);

/// <summary>
/// Sends in-app reminders for assignments that are due soon or overdue.
/// <para>
/// Reminders go to the person the step is waiting on. Each assignment is reminded once as its
/// deadline approaches, then — once overdue — no more often than the repeat interval in
/// Settings, so nobody is sent the same reminder on every run.
/// </para>
/// <para>
/// In-app only for now: there is no email delivery yet. When there is, it belongs here.
/// </para>
/// </summary>
public sealed class ReminderJob(
    FremaDbContext db,
    ISettingsService settings,
    ILogger<ReminderJob> logger)
{
    /// <summary>Per run, so one very large backlog cannot hold a single transaction open.</summary>
    private const int BatchSize = 500;

    public async Task<ReminderRunResult> RunAsync(CancellationToken ct = default)
    {
        var current = await settings.GetAsync(ct);
        if (!current.RemindersEnabled)
        {
            return new ReminderRunResult(0, 0, Enabled: false);
        }

        var now = DateTimeOffset.UtcNow;
        var dueSoonCutoff = now.AddHours(current.ReminderDueSoonHours);
        var repeatCutoff = now.AddHours(-current.ReminderRepeatHours);

        var candidates = await db.WorkflowRoutings
            .Where(r => r.Status == RoutingStatus.Pending && r.DueDate != null)
            .Where(r =>
                // Due soon, and not yet reminded at all.
                (r.DueDate > now && r.DueDate <= dueSoonCutoff && r.LastReminderAt == null)
                // Overdue, and not reminded within the repeat interval.
                || (r.DueDate <= now && (r.LastReminderAt == null || r.LastReminderAt <= repeatCutoff)))
            .OrderBy(r => r.DueDate)
            .Take(BatchSize)
            .Select(r => new
            {
                Routing = r,
                r.Document.Title,
                r.Document.Number,
                Step = r.WorkflowStep.Name,
            })
            .ToListAsync(ct);

        var dueSoon = 0;
        var overdue = 0;

        foreach (var c in candidates)
        {
            var routing = c.Routing;
            var isOverdue = routing.DueDate <= now;
            var due = routing.DueDate!.Value;

            db.Notifications.Add(new Notification
            {
                UserId = routing.AssignedToId,
                DocumentId = routing.DocumentId,
                Link = $"/documents/{routing.DocumentId}",
                Message = isOverdue
                    ? $"Overdue: “{c.Title}” ({c.Number}) was due {due:d MMM} at step “{c.Step}”."
                    : $"Due soon: “{c.Title}” ({c.Number}) is due {due:d MMM HH:mm} UTC at step “{c.Step}”.",
            });

            routing.LastReminderAt = now;

            if (isOverdue) overdue++;
            else dueSoon++;
        }

        if (candidates.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Sent {DueSoon} due-soon and {Overdue} overdue reminders", dueSoon, overdue);
        }

        return new ReminderRunResult(dueSoon, overdue, Enabled: true);
    }
}

/// <summary>Runs <see cref="ReminderJob"/> on a schedule for as long as the application is up.</summary>
public sealed class ReminderHostedService(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<ReminderHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var minutes = configuration.GetValue("Reminders:IntervalMinutes", 15);
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(Math.Max(1, minutes)));

        // Wait one interval before the first run, so starting the app — or running the seeder
        // or a migration — never sends a burst of reminders.
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                await scope.ServiceProvider.GetRequiredService<ReminderJob>().RunAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One failed run must not stop future ones.
                logger.LogError(ex, "Reminder run failed");
            }
        }
    }
}
