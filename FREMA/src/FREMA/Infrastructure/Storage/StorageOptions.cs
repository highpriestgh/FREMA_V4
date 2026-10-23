using System.ComponentModel.DataAnnotations;

namespace FREMA.Infrastructure.Storage;

/// <summary>
/// Where document content lives and what is allowed into it.
/// <para>
/// The legacy API wrote uploads into <c>ImgFolder</c> beneath the application directory and
/// then served that folder as static files <em>with directory browsing enabled</em>, ahead
/// of the authentication middleware. Every document in the system was listable and
/// downloadable by anyone who could reach the API. The root here is deliberately outside the
/// web root, and nothing under it is ever served statically.
/// </para>
/// </summary>
public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>
    /// Absolute path to the storage root. Must not sit inside <c>wwwroot</c>.
    /// </summary>
    [Required(AllowEmptyStrings = false)]
    public string RootPath { get; set; } = string.Empty;

    /// <summary>
    /// The largest upload the server will ever accept. Administrators choose the working limit
    /// and file types in Settings, but cannot raise it past this — it is also what the web
    /// server's request-size limit is set from. The legacy API had no limit at all.
    /// </summary>
    [Range(1, 1024L * 1024 * 1024)]
    public long MaxFileSizeBytes { get; set; } = 200L * 1024 * 1024;
}
