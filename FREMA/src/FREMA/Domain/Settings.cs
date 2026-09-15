namespace FREMA.Domain;

/// <summary>
/// Organisation-wide settings, edited by administrators in the app.
/// <para>
/// A single row (<see cref="SingletonId"/>). Typed columns rather than a key–value table, so
/// every setting has a real type, a default, and a place in a migration when it changes.
/// </para>
/// </summary>
public class SystemSettings
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;

    // --- Organisation ------------------------------------------------------

    public string OrganisationName { get; set; } = "FREMA";

    /// <summary>
    /// Logo bytes. Small, and needed on the sign-in page before anyone is signed in, so it is
    /// held here rather than in document storage. PNG, JPEG or WebP only — SVG can carry
    /// script.
    /// </summary>
    public byte[]? LogoContent { get; set; }

    public string? LogoContentType { get; set; }

    public DateTimeOffset? LogoUpdatedAt { get; set; }

    // --- Document numbering ------------------------------------------------
    // Produces e.g. FR-2026-000124.

    public string NumberPrefix { get; set; } = "FR";

    public bool NumberIncludesYear { get; set; } = true;

    /// <summary>Zero-padded width of the running number.</summary>
    public int NumberDigits { get; set; } = 6;

    /// <summary>Restart the count at 1 each calendar year.</summary>
    public bool NumberResetsYearly { get; set; } = true;

    // --- Deadlines and reminders ---------------------------------------------

    /// <summary>Deadline, in days, for a workflow step that does not set its own. Null means none.</summary>
    public int? DefaultDueDays { get; set; } = 5;

    public bool RemindersEnabled { get; set; } = true;

    /// <summary>Remind the assignee this many hours before the deadline.</summary>
    public int ReminderDueSoonHours { get; set; } = 24;

    /// <summary>Once overdue, remind again at most this often.</summary>
    public int ReminderRepeatHours { get; set; } = 24;

    // --- Uploads -----------------------------------------------------------

    /// <summary>Comma-separated, lower case, dot-prefixed, e.g. ".pdf,.png".</summary>
    public string AllowedExtensions { get; set; } = ".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt";

    public int MaxUploadMegabytes { get; set; } = 50;

    public DateTimeOffset? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }
}

/// <summary>
/// The last number issued in a numbering scope — a calendar year, or <c>all</c> when numbers
/// never reset. Incremented in the same transaction that saves the document, so a failed save
/// does not use up a number.
/// </summary>
public class DocumentNumberCounter
{
    public required string Scope { get; set; }

    public int LastValue { get; set; }
}
