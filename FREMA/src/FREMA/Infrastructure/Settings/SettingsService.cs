using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace FREMA.Infrastructure.Settings;

/// <summary>
/// What an upload must satisfy right now: the administrator's choices, held within the
/// ceilings set in server configuration.
/// </summary>
public sealed record UploadPolicy(IReadOnlyList<string> AllowedExtensions, long MaxFileSizeBytes);

/// <summary>
/// Reads organisation settings, cached, for the many places that consult them on every
/// request — uploads, numbering, deadlines, the sign-in page.
/// </summary>
public interface ISettingsService
{
    Task<SystemSettings> GetAsync(CancellationToken ct = default);

    Task<UploadPolicy> GetUploadPolicyAsync(CancellationToken ct = default);

    /// <summary>Drops the cached copy so the next read sees a change immediately.</summary>
    void Invalidate();
}

public sealed class SettingsService(
    IServiceScopeFactory scopeFactory,
    IMemoryCache cache,
    IOptions<StorageOptions> storage) : ISettingsService
{
    private const string CacheKey = "system-settings";

    /// <summary>
    /// File types the server can positively identify from their contents. An administrator can
    /// narrow this list but never widen it: allowing a type the inspector cannot check would
    /// let anything be uploaded under that extension.
    /// </summary>
    public static readonly IReadOnlyList<string> RecognisedExtensions =
        [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".doc", ".docx", ".xls", ".xlsx", ".txt"];

    public async Task<SystemSettings> GetAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue(CacheKey, out SystemSettings? cached) && cached is not null)
        {
            return cached;
        }

        // Singleton service, scoped context: resolve one for the read.
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FremaDbContext>();

        var settings = await db.SystemSettings.AsNoTracking()
            .FirstAsync(s => s.Id == SystemSettings.SingletonId, ct);

        // Short expiry as a backstop; updates invalidate explicitly. The logo bytes are part
        // of the row, which keeps this small cache honest about what it holds.
        cache.Set(CacheKey, settings, TimeSpan.FromMinutes(5));
        return settings;
    }

    public async Task<UploadPolicy> GetUploadPolicyAsync(CancellationToken ct = default)
    {
        var settings = await GetAsync(ct);

        var extensions = ParseExtensions(settings.AllowedExtensions)
            .Where(e => RecognisedExtensions.Contains(e))
            .ToList();

        var ceiling = storage.Value.MaxFileSizeBytes;
        var chosen = (long)settings.MaxUploadMegabytes * 1024 * 1024;

        return new UploadPolicy(extensions, Math.Min(chosen, ceiling));
    }

    public void Invalidate() => cache.Remove(CacheKey);

    public static List<string> ParseExtensions(string value) =>
        [.. value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(e => (e.StartsWith('.') ? e : "." + e).ToLowerInvariant())
            .Distinct()];
}
