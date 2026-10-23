using System.Security.Cryptography;
using FREMA.Common;
using FREMA.Infrastructure.Settings;
using Microsoft.Extensions.Options;

namespace FREMA.Infrastructure.Storage;

/// <summary>A file that has been written to storage.</summary>
/// <param name="Key">Opaque storage key. Never derived from anything the client supplied.</param>
/// <param name="ContentType">Established by inspection, not by what the client claimed.</param>
/// <param name="Sha256">Lowercase hex digest, for integrity checks and de-duplication.</param>
public sealed record StoredFile(string Key, string ContentType, long SizeBytes, string Sha256);

public interface IDocumentStorage
{
    /// <summary>
    /// Streams <paramref name="content"/> into storage, validating size and type as it goes.
    /// </summary>
    /// <exception cref="DomainRuleException">The file is too large, empty, or not an accepted type.</exception>
    Task<StoredFile> SaveAsync(Stream content, string originalFileName, CancellationToken ct = default);

    /// <summary>Opens a stored file for reading, or null when the key is unknown.</summary>
    Stream? OpenRead(string key);

    /// <summary>Removes a stored file. Succeeds silently when it is already gone.</summary>
    void Delete(string key);
}

/// <summary>
/// Stores document content on local disk, beneath <see cref="StorageOptions.RootPath"/>.
/// <para>
/// The interface exists so this can become S3 or Azure Blob without the endpoints changing.
/// </para>
/// </summary>
public sealed class LocalDiskDocumentStorage : IDocumentStorage
{
    private readonly StorageOptions _options;
    private readonly ISettingsService _settings;
    private readonly ILogger<LocalDiskDocumentStorage> _logger;
    private readonly string _root;

    public LocalDiskDocumentStorage(
        IOptions<StorageOptions> options,
        ISettingsService settings,
        ILogger<LocalDiskDocumentStorage> logger)
    {
        _options = options.Value;
        _settings = settings;
        _logger = logger;
        _root = Path.GetFullPath(_options.RootPath);

        Directory.CreateDirectory(_root);
        _logger.LogInformation("Document storage root: {Root}", _root);
    }

    public async Task<StoredFile> SaveAsync(
        Stream content,
        string originalFileName,
        CancellationToken ct = default)
    {
        var extension = Path.GetExtension(originalFileName).ToLowerInvariant();

        // The rules an administrator set in Settings, capped by the server configuration.
        var policy = await _settings.GetUploadPolicyAsync(ct);

        if (string.IsNullOrEmpty(extension) || !policy.AllowedExtensions.Contains(extension))
        {
            throw new DomainRuleException(
                $"Files of type '{extension}' are not accepted. Allowed: " +
                string.Join(", ", policy.AllowedExtensions));
        }

        // Read enough to identify the content before committing anything to disk.
        var header = new byte[FileTypeInspector.HeaderSize];
        var headerLength = await ReadAtLeastAsync(content, header, ct);

        if (headerLength == 0)
        {
            throw new DomainRuleException("The file is empty.");
        }

        var (contentType, matchesExtension) =
            FileTypeInspector.Inspect(header.AsSpan(0, headerLength), extension);

        if (string.IsNullOrEmpty(contentType) || !matchesExtension)
        {
            throw new DomainRuleException(
                $"The file's contents do not match its '{extension}' extension.");
        }

        // The key is generated, never built from the client's filename — that is what keeps
        // a name like "../../web.config" from escaping the storage root.
        var key = $"{DateTimeOffset.UtcNow:yyyy/MM}/{Guid.NewGuid():N}{extension}";
        var path = ResolvePath(key);

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        long size;
        byte[] hash;

        try
        {
            await using var destination = new FileStream(
                path, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                bufferSize: 64 * 1024, useAsync: true);

            using var sha = SHA256.Create();

            // Hash and length are accumulated during the copy, so the file is never held in
            // memory and never read back a second time.
            size = await CopyWithLimitAsync(header, headerLength, content, destination, sha, policy.MaxFileSizeBytes, ct);
            hash = sha.Hash!;
        }
        catch
        {
            TryDelete(path);
            throw;
        }

        _logger.LogInformation("Stored {Key} ({Size} bytes, {ContentType})", key, size, contentType);

        return new StoredFile(key, contentType, size, Convert.ToHexString(hash).ToLowerInvariant());
    }

    public Stream? OpenRead(string key)
    {
        var path = ResolvePath(key);

        return File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
                bufferSize: 64 * 1024, useAsync: true)
            : null;
    }

    public void Delete(string key) => TryDelete(ResolvePath(key));

    /// <summary>
    /// Maps a key to a path and refuses anything that would resolve outside the root.
    /// Keys are generated rather than supplied, so this is defence in depth — but a stored
    /// key could still be tampered with in the database.
    /// </summary>
    private string ResolvePath(string key)
    {
        var path = Path.GetFullPath(Path.Combine(_root, key));

        if (!path.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw new DomainRuleException("Invalid storage key.");
        }

        return path;
    }

    /// <summary>
    /// Copies to disk while hashing, aborting the moment the size limit is passed rather
    /// than after the whole upload has been accepted.
    /// </summary>
    private async Task<long> CopyWithLimitAsync(
        byte[] header,
        int headerLength,
        Stream source,
        Stream destination,
        SHA256 sha,
        long maxBytes,
        CancellationToken ct)
    {
        long total = headerLength;

        await destination.WriteAsync(header.AsMemory(0, headerLength), ct);
        sha.TransformBlock(header, 0, headerLength, null, 0);

        var buffer = new byte[64 * 1024];
        int read;

        while ((read = await source.ReadAsync(buffer, ct)) > 0)
        {
            total += read;

            if (total > maxBytes)
            {
                throw new DomainRuleException(
                    $"The file exceeds the {maxBytes / (1024 * 1024)} MB limit.");
            }

            await destination.WriteAsync(buffer.AsMemory(0, read), ct);
            sha.TransformBlock(buffer, 0, read, null, 0);
        }

        sha.TransformFinalBlock([], 0, 0);
        return total;
    }

    /// <summary>Fills the buffer as far as the stream allows; a short read is not an error.</summary>
    private static async Task<int> ReadAtLeastAsync(Stream source, byte[] buffer, CancellationToken ct)
    {
        var total = 0;

        while (total < buffer.Length)
        {
            var read = await source.ReadAsync(buffer.AsMemory(total), ct);
            if (read == 0)
            {
                break;
            }

            total += read;
        }

        return total;
    }

    private void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (IOException ex)
        {
            // Worth knowing about — it leaves an orphan — but not worth failing the request.
            _logger.LogWarning(ex, "Could not delete {Path}", path);
        }
    }
}
