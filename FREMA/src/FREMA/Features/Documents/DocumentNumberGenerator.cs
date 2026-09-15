using System.Globalization;
using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Settings;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Documents;

/// <summary>
/// Issues register numbers in the organisation's format, e.g. <c>FR-2026-000124</c>.
/// </summary>
public sealed class DocumentNumberGenerator(FremaDbContext db, ISettingsService settings)
{
    /// <summary>
    /// Takes the next number. <b>Must be called inside a transaction</b> that also saves the
    /// document.
    /// <para>
    /// The counter row is incremented with a locking MERGE, so two people registering at the
    /// same moment cannot receive the same number. Because the increment belongs to the
    /// caller's transaction, a document that fails to save rolls its number back with it and
    /// the register keeps no gaps.
    /// </para>
    /// </summary>
    public async Task<string> NextAsync(CancellationToken ct = default)
    {
        var current = await settings.GetAsync(ct);
        var year = DateTimeOffset.UtcNow.Year;
        var scope = ScopeFor(current, year);

        // A number typed in by hand earlier could already occupy the next slot; skip past it
        // rather than fail on the unique index.
        while (true)
        {
            var value = (await db.Database.SqlQuery<int>($"""
                MERGE DocumentNumberCounters WITH (HOLDLOCK) AS target
                USING (SELECT {scope} AS Scope) AS source ON target.Scope = source.Scope
                WHEN MATCHED THEN UPDATE SET LastValue = target.LastValue + 1
                WHEN NOT MATCHED THEN INSERT (Scope, LastValue) VALUES (source.Scope, 1)
                OUTPUT inserted.LastValue AS Value;
                """).ToListAsync(ct)).Single();

            var number = Format(current, year, value);

            if (!await db.Documents.AnyAsync(d => d.Number == number, ct))
            {
                return number;
            }
        }
    }

    /// <summary>The number the next document would receive, without taking it.</summary>
    public async Task<string> PreviewAsync(SystemSettings candidate, CancellationToken ct = default)
    {
        var year = DateTimeOffset.UtcNow.Year;
        var scope = ScopeFor(candidate, year);

        var last = await db.DocumentNumberCounters.AsNoTracking()
            .Where(c => c.Scope == scope)
            .Select(c => (int?)c.LastValue)
            .FirstOrDefaultAsync(ct) ?? 0;

        return Format(candidate, year, last + 1);
    }

    /// <summary>
    /// A counter per calendar year when numbers reset yearly, otherwise one counter for all
    /// time. Changing the prefix does not restart the count.
    /// </summary>
    private static string ScopeFor(SystemSettings s, int year) =>
        s.NumberResetsYearly ? year.ToString(CultureInfo.InvariantCulture) : "all";

    public static string Format(SystemSettings s, int year, int value)
    {
        var running = value.ToString(CultureInfo.InvariantCulture).PadLeft(s.NumberDigits, '0');
        return s.NumberIncludesYear
            ? $"{s.NumberPrefix}-{year.ToString(CultureInfo.InvariantCulture)}-{running}"
            : $"{s.NumberPrefix}-{running}";
    }
}
