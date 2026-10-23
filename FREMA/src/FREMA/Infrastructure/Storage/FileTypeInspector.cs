namespace FREMA.Infrastructure.Storage;

/// <summary>
/// Identifies a file from its leading bytes.
/// <para>
/// The legacy upload path took the client's declared MIME type straight from a base64 data
/// URI and chose the stored file's extension from it — so a caller could label anything
/// <c>data:application/pdf;base64,</c> and have it written as a <c>.pdf</c>. Content is
/// established here by inspection, and the declared type is treated as a hint at best.
/// </para>
/// </summary>
public static class FileTypeInspector
{
    /// <summary>Bytes needed to recognise every signature below.</summary>
    public const int HeaderSize = 512;

    private sealed record Signature(byte[] Magic, string ContentType, string[] Extensions);

    /// <summary>Local file header of a ZIP archive — the container for every modern Office format.</summary>
    private static readonly byte[] ZipMagic = [0x50, 0x4B, 0x03, 0x04];

    private static readonly Signature[] Signatures =
    [
        new("%PDF"u8.ToArray(), "application/pdf", [".pdf"]),
        new([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "image/png", [".png"]),
        new([0xFF, 0xD8, 0xFF], "image/jpeg", [".jpg", ".jpeg"]),
        new("GIF87a"u8.ToArray(), "image/gif", [".gif"]),
        new("GIF89a"u8.ToArray(), "image/gif", [".gif"]),
        new([0x42, 0x4D], "image/bmp", [".bmp"]),
        new([0x49, 0x49, 0x2A, 0x00], "image/tiff", [".tif", ".tiff"]),
        new([0x4D, 0x4D, 0x00, 0x2A], "image/tiff", [".tif", ".tiff"]),

        // Legacy Office compound-file format: .doc and .xls share it.
        new([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1],
            "application/x-ole-storage", [".doc", ".xls"]),
    ];

    /// <summary>
    /// What the header says this file is, or null when nothing matches.
    /// <para>
    /// Modern Office documents are ZIP archives, so a <c>PK</c> header alone cannot separate
    /// a <c>.docx</c> from a <c>.xlsx</c> or a plain archive. For those the extension decides,
    /// but only once the header has confirmed it really is a ZIP.
    /// </para>
    /// </summary>
    public static (string ContentType, bool MatchesExtension) Inspect(
        ReadOnlySpan<byte> header,
        string extension)
    {
        extension = extension.ToLowerInvariant();

        foreach (var signature in Signatures)
        {
            if (!header.StartsWith(signature.Magic))
            {
                continue;
            }

            var contentType = signature.ContentType switch
            {
                // Resolve the shared OLE container by the claimed extension.
                "application/x-ole-storage" when extension == ".xls" => "application/vnd.ms-excel",
                "application/x-ole-storage" => "application/msword",
                var other => other,
            };

            return (contentType, signature.Extensions.Contains(extension));
        }

        if (header.StartsWith(ZipMagic))
        {
            return extension switch
            {
                ".docx" => ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", true),
                ".xlsx" => ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", true),
                _ => ("application/zip", false),
            };
        }

        // Plain text has no signature; accept it only when that is what was claimed and the
        // bytes contain no NUL, which would mean the content is binary.
        if (extension == ".txt" && !header.Contains((byte)0))
        {
            return ("text/plain", true);
        }

        return (string.Empty, false);
    }
}
