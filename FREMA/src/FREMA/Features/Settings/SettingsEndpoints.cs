using System.Text.RegularExpressions;
using Duende.Bff;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Features.Documents;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Reminders;
using FREMA.Infrastructure.Settings;
using FREMA.Infrastructure.Storage;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;

namespace FREMA.Features.Settings;

public sealed record SettingsDto(
    string OrganisationName,
    bool HasLogo,
    string? LogoUrl,
    string NumberPrefix,
    bool NumberIncludesYear,
    int NumberDigits,
    bool NumberResetsYearly,
    string NextNumber,
    int? DefaultDueDays,
    bool RemindersEnabled,
    int ReminderDueSoonHours,
    int ReminderRepeatHours,
    IReadOnlyList<string> AllowedExtensions,
    IReadOnlyList<string> RecognisedExtensions,
    int MaxUploadMegabytes,
    int MaxUploadMegabytesCeiling,
    DateTimeOffset? UpdatedAt,
    string? UpdatedBy);

public sealed record SaveSettingsRequest(
    string OrganisationName,
    string NumberPrefix,
    bool NumberIncludesYear,
    int NumberDigits,
    bool NumberResetsYearly,
    int? DefaultDueDays,
    bool RemindersEnabled,
    int ReminderDueSoonHours,
    int ReminderRepeatHours,
    IReadOnlyList<string> AllowedExtensions,
    int MaxUploadMegabytes);

/// <summary>What every signed-in page needs: branding and the upload rules.</summary>
public sealed record ClientSettingsDto(
    string OrganisationName,
    string? LogoUrl,
    IReadOnlyList<string> AllowedExtensions,
    long MaxUploadBytes);

public static partial class SettingsEndpoints
{
    private const int MaxLogoBytes = 512 * 1024;

    public static IEndpointRouteBuilder MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/settings").WithTags("Settings");
        admin.AsBffApiEndpoint();

        admin.MapGet("/", GetAsync).RequireAuthorization(Permissions.ManageSettings);
        admin.MapPut("/", SaveAsync).RequireAuthorization(Permissions.ManageSettings);
        admin.MapPut("/logo", UploadLogoAsync).RequireAuthorization(Permissions.ManageSettings).DisableAntiforgery();
        admin.MapDelete("/logo", DeleteLogoAsync).RequireAuthorization(Permissions.ManageSettings);
        admin.MapPost("/reminders/run", RunRemindersAsync).RequireAuthorization(Permissions.ManageSettings);
        admin.MapGet("/client", ClientAsync).RequireAuthorization();

        // Not a BFF API endpoint: an <img> tag cannot send the antiforgery header, and the sign-in
        // page shows the logo before anyone has a session.
        app.MapGet("/branding/logo", LogoAsync).WithTags("Settings").AllowAnonymous();

        return app;
    }

    private static async Task<Ok<SettingsDto>> GetAsync(
        ISettingsService settings,
        DocumentNumberGenerator numbers,
        IOptions<StorageOptions> storage,
        CancellationToken ct)
    {
        var s = await settings.GetAsync(ct);
        return TypedResults.Ok(await ToDtoAsync(s, numbers, storage.Value, ct));
    }

    private static async Task<Ok<SettingsDto>> SaveAsync(
        SaveSettingsRequest request,
        FremaDbContext db,
        ISettingsService settings,
        DocumentNumberGenerator numbers,
        IOptions<StorageOptions> storage,
        IAuditService audit,
        ICurrentUser user,
        CancellationToken ct)
    {
        var ceilingMb = CeilingMegabytes(storage.Value);

        var name = request.OrganisationName?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 200)
            throw new DomainRuleException("The organisation name is required, up to 200 characters.");

        var prefix = request.NumberPrefix?.Trim().ToUpperInvariant() ?? "";
        if (!PrefixPattern().IsMatch(prefix))
            throw new DomainRuleException("The number prefix must be 1–10 letters or digits.");

        if (request.NumberDigits is < 3 or > 10)
            throw new DomainRuleException("The running number must be between 3 and 10 digits.");

        if (request.DefaultDueDays is < 1 or > 365)
            throw new DomainRuleException("The default deadline must be between 1 and 365 days, or none.");

        if (request.ReminderDueSoonHours is < 1 or > 720)
            throw new DomainRuleException("The due-soon reminder must be between 1 and 720 hours before the deadline.");

        if (request.ReminderRepeatHours is < 1 or > 720)
            throw new DomainRuleException("Overdue reminders must repeat every 1 to 720 hours.");

        if (request.MaxUploadMegabytes < 1 || request.MaxUploadMegabytes > ceilingMb)
            throw new DomainRuleException($"The maximum upload size must be between 1 and {ceilingMb} MB.");

        var extensions = SettingsService.ParseExtensions(string.Join(',', request.AllowedExtensions ?? []));
        if (extensions.Count == 0)
            throw new DomainRuleException("Allow at least one file type.");

        var unknown = extensions.Except(SettingsService.RecognisedExtensions).ToList();
        if (unknown.Count > 0)
            throw new DomainRuleException(
                $"These file types cannot be checked by the server, so they cannot be allowed: {string.Join(", ", unknown)}.");

        var row = await db.SystemSettings.FirstAsync(s => s.Id == SystemSettings.SingletonId, ct);
        var numberingChanged = row.NumberPrefix != prefix || row.NumberIncludesYear != request.NumberIncludesYear
            || row.NumberDigits != request.NumberDigits || row.NumberResetsYearly != request.NumberResetsYearly;

        row.OrganisationName = name;
        row.NumberPrefix = prefix;
        row.NumberIncludesYear = request.NumberIncludesYear;
        row.NumberDigits = request.NumberDigits;
        row.NumberResetsYearly = request.NumberResetsYearly;
        row.DefaultDueDays = request.DefaultDueDays;
        row.RemindersEnabled = request.RemindersEnabled;
        row.ReminderDueSoonHours = request.ReminderDueSoonHours;
        row.ReminderRepeatHours = request.ReminderRepeatHours;
        row.AllowedExtensions = string.Join(',', extensions);
        row.MaxUploadMegabytes = request.MaxUploadMegabytes;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        row.UpdatedBy = user.UserName;

        audit.Record("settings.updated", AuditEntityType.Session, null, new
        {
            request.OrganisationName, prefix, request.NumberDigits, request.NumberIncludesYear,
            request.NumberResetsYearly, request.DefaultDueDays, request.RemindersEnabled,
            request.ReminderDueSoonHours, request.ReminderRepeatHours,
            AllowedExtensions = extensions, request.MaxUploadMegabytes, NumberingChanged = numberingChanged,
        });

        await db.SaveChangesAsync(ct);
        settings.Invalidate();

        return TypedResults.Ok(await ToDtoAsync(await settings.GetAsync(ct), numbers, storage.Value, ct));
    }

    private static async Task<Ok<SettingsDto>> UploadLogoAsync(
        IFormFile file,
        FremaDbContext db,
        ISettingsService settings,
        DocumentNumberGenerator numbers,
        IOptions<StorageOptions> storage,
        IAuditService audit,
        CancellationToken ct)
    {
        if (file.Length == 0) throw new DomainRuleException("The image is empty.");
        if (file.Length > MaxLogoBytes) throw new DomainRuleException("The logo must be 512 KB or smaller.");

        await using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();

        // Established from the bytes, not from the name or the declared type.
        var contentType = SniffImage(bytes)
            ?? throw new DomainRuleException("The logo must be a PNG, JPEG or WebP image.");

        var row = await db.SystemSettings.FirstAsync(s => s.Id == SystemSettings.SingletonId, ct);
        row.LogoContent = bytes;
        row.LogoContentType = contentType;
        row.LogoUpdatedAt = DateTimeOffset.UtcNow;

        audit.Record("settings.logo.updated", AuditEntityType.Session, null, new { contentType, Bytes = bytes.Length });
        await db.SaveChangesAsync(ct);
        settings.Invalidate();

        return TypedResults.Ok(await ToDtoAsync(await settings.GetAsync(ct), numbers, storage.Value, ct));
    }

    private static async Task<NoContent> DeleteLogoAsync(
        FremaDbContext db, ISettingsService settings, IAuditService audit, CancellationToken ct)
    {
        var row = await db.SystemSettings.FirstAsync(s => s.Id == SystemSettings.SingletonId, ct);
        row.LogoContent = null;
        row.LogoContentType = null;
        row.LogoUpdatedAt = DateTimeOffset.UtcNow;

        audit.Record("settings.logo.removed", AuditEntityType.Session);
        await db.SaveChangesAsync(ct);
        settings.Invalidate();

        return TypedResults.NoContent();
    }

    private static async Task<IResult> LogoAsync(ISettingsService settings, CancellationToken ct)
    {
        var s = await settings.GetAsync(ct);
        if (s.LogoContent is null || s.LogoContentType is null)
        {
            return TypedResults.NotFound();
        }

        // The URL carries a version stamp, so the image can be cached hard and still change
        // the moment a new logo is uploaded.
        return TypedResults.File(
            s.LogoContent,
            s.LogoContentType,
            lastModified: s.LogoUpdatedAt,
            entityTag: new EntityTagHeaderValue($"\"{s.LogoUpdatedAt?.ToUnixTimeSeconds()}\""));
    }

    private static async Task<Ok<ReminderRunResult>> RunRemindersAsync(ReminderJob job, CancellationToken ct) =>
        TypedResults.Ok(await job.RunAsync(ct));

    private static async Task<Ok<ClientSettingsDto>> ClientAsync(ISettingsService settings, CancellationToken ct)
    {
        var s = await settings.GetAsync(ct);
        var policy = await settings.GetUploadPolicyAsync(ct);
        return TypedResults.Ok(new ClientSettingsDto(s.OrganisationName, LogoUrl(s), policy.AllowedExtensions, policy.MaxFileSizeBytes));
    }

    private static async Task<SettingsDto> ToDtoAsync(
        SystemSettings s, DocumentNumberGenerator numbers, StorageOptions storage, CancellationToken ct) =>
        new(
            s.OrganisationName,
            s.LogoContent is not null,
            LogoUrl(s),
            s.NumberPrefix,
            s.NumberIncludesYear,
            s.NumberDigits,
            s.NumberResetsYearly,
            await numbers.PreviewAsync(s, ct),
            s.DefaultDueDays,
            s.RemindersEnabled,
            s.ReminderDueSoonHours,
            s.ReminderRepeatHours,
            SettingsService.ParseExtensions(s.AllowedExtensions),
            SettingsService.RecognisedExtensions,
            s.MaxUploadMegabytes,
            CeilingMegabytes(storage),
            s.UpdatedAt,
            s.UpdatedBy);

    public static string? LogoUrl(SystemSettings s) =>
        s.LogoContent is null ? null : $"/branding/logo?v={s.LogoUpdatedAt?.ToUnixTimeSeconds()}";

    private static int CeilingMegabytes(StorageOptions storage) => (int)(storage.MaxFileSizeBytes / (1024 * 1024));

    /// <summary>
    /// PNG, JPEG or WebP, from the file signature. SVG is excluded on purpose: it can carry
    /// script, and the logo is served from this origin.
    /// </summary>
    private static string? SniffImage(byte[] b)
    {
        if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return "image/png";
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
        if (b.Length >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46
            && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50) return "image/webp";
        return null;
    }

    [GeneratedRegex("^[A-Z0-9]{1,10}$")]
    private static partial Regex PrefixPattern();
}
