using Microsoft.EntityFrameworkCore;

namespace FREMA.Common;

public static class TransactionExtensions
{
    /// <summary>
    /// Runs <paramref name="work"/> in a transaction the execution strategy can retry as a
    /// whole.
    /// <para>
    /// The context retries transient failures, and a retrying strategy refuses transactions it
    /// did not open — it could not replay them. So the unit runs inside the strategy, and a
    /// retry re-executes all of it. The change tracker is cleared before each attempt so a
    /// retry starts from what the database holds, not from half-applied state.
    /// </para>
    /// </summary>
    public static Task<T> InRetriableTransactionAsync<T>(
        this DbContext db, Func<Task<T>> work, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var result = await work();
            await transaction.CommitAsync(ct);
            return result;
        });
}
