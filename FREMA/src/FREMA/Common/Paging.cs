using Microsoft.EntityFrameworkCore;

namespace FREMA.Common;

/// <summary>
/// A page of results plus the totals a client needs to render pagination.
/// <para>
/// Every collection endpoint returns one of these. The legacy API had no paging anywhere —
/// <c>GetAllDocument</c> and <c>GetAllUsers</c> returned every row in the system, and in the
/// document case every file body with them.
/// </para>
/// </summary>
public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasPrevious => Page > 1;
    public bool HasNext => Page < TotalPages;
}

/// <summary>
/// Paging parameters bound from the query string, clamped to a sane range.
/// A caller asking for a million rows gets <see cref="MaxPageSize"/>, not a million rows.
/// </summary>
public sealed record PageRequest
{
    public const int MaxPageSize = 100;
    public const int DefaultPageSize = 25;

    // Nullable so [AsParameters] treats them as optional. Non-nullable ints would be
    // *required* query-string values, and omitting ?page= would be a 400.
    public int? Page { get; init; }
    public int? PageSize { get; init; }

    /// <summary>The requested page, one-based; out-of-range values fall back to the first.</summary>
    public int Number => Page is { } p and > 0 ? p : 1;

    /// <summary>The requested size, clamped to <see cref="MaxPageSize"/>.</summary>
    public int Size => PageSize switch
    {
        null or < 1 => DefaultPageSize,
        > MaxPageSize => MaxPageSize,
        var value => value.Value,
    };

    public int Skip => (Number - 1) * Size;
}

public static class QueryableExtensions
{
    /// <summary>
    /// Materialises one page and the total in two queries. Counts before paging so the
    /// total reflects the filter, not the page.
    /// </summary>
    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(
        this IQueryable<T> query,
        PageRequest page,
        CancellationToken ct = default)
    {
        var total = await query.CountAsync(ct);

        var items = await query
            .Skip(page.Skip)
            .Take(page.Size)
            .ToListAsync(ct);

        return new PagedResult<T>(items, page.Number, page.Size, total);
    }
}
