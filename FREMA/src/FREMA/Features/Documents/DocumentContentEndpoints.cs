using Duende.Bff;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;

namespace FREMA.Features.Documents;

/// <summary>
/// Upload and download of document content.
/// <para>
/// Kept apart from the metadata endpoints because the transport is different: multipart in,
/// a byte stream out. The legacy API had neither — it carried file bodies as base64 data
/// URIs inside ordinary JSON responses, so listing documents meant loading every file in the
/// system into memory and inflating it by a third on the wire.
/// </para>
/// </summary>
public static class DocumentContentEndpoints
{
    public static IEndpointRouteBuilder MapDocumentContentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/documents/{id:guid}/content").WithTags("Documents");
        group.AsBffApiEndpoint();

        group.MapPut("/", UploadAsync)
            .RequireAuthorization(Permissions.UploadDocuments)
            .DisableAntiforgery() // BFF's X-CSRF header guards this; see comment in UploadAsync.
            .WithName("UploadDocumentContent");

        group.MapGet("/", DownloadAsync)
            .RequireAuthorization(Permissions.ViewDocuments)
            .WithName("DownloadDocumentContent");

        group.MapDelete("/", DeleteAsync)
            .RequireAuthorization(Permissions.EditDocuments);

        return app;
    }

    /// <summary>
    /// Attaches content to a document, replacing whatever was there.
    /// <para>
    /// <c>DisableAntiforgery</c> switches off ASP.NET Core's <em>form-token</em> check, which
    /// expects a hidden field a JSON client cannot supply. The request is still protected:
    /// BFF requires the <c>X-CSRF</c> header on every call in this group, and a cross-site
    /// form post cannot set a custom header.
    /// </para>
    /// </summary>
    private static async Task<Ok<FileMetadataDto>> UploadAsync(
        Guid id,
        IFormFile file,
        FremaDbContext db,
        IDocumentStorage storage,
        IAuthorizationService authorization,
        IAuditService audit,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        await AuthorizeAsync(authorization, http, document, DocumentOperations.Edit);

        if (file.Length == 0)
        {
            throw new DomainRuleException("The file is empty.");
        }

        await using var incoming = file.OpenReadStream();
        var stored = await storage.SaveAsync(incoming, file.FileName, ct);

        // Replacing content orphans the previous blob; remove it only once the new one is
        // safely written, so a failed upload cannot destroy the existing document.
        var previousKey = document.FileKey;

        document.FileKey = stored.Key;
        document.FileName = Path.GetFileName(file.FileName);
        document.ContentType = stored.ContentType;
        document.FileSizeBytes = stored.SizeBytes;
        document.FileHash = stored.Sha256;
        document.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Record(AuditActions.DocumentContentUploaded, AuditEntityType.Document, document.Id,
            new { document.FileName, stored.ContentType, stored.SizeBytes, stored.Sha256 });

        await db.SaveChangesAsync(ct);

        if (previousKey is not null && previousKey != stored.Key)
        {
            storage.Delete(previousKey);
        }

        return TypedResults.Ok(new FileMetadataDto(
            document.FileName, document.ContentType, document.FileSizeBytes, document.PageCount));
    }

    /// <summary>
    /// Streams the content back.
    /// <para>
    /// <c>TypedResults.Stream</c> handles conditional requests and range requests from the
    /// ETag and length given here, so a viewer can seek within a large PDF instead of
    /// downloading all of it — none of which is possible when a file arrives as base64 in a
    /// JSON field.
    /// </para>
    /// </summary>
    private static async Task<IResult> DownloadAsync(
        Guid id,
        [FromQuery] bool? download,
        FremaDbContext db,
        IDocumentStorage storage,
        IAuthorizationService authorization,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        // The gate the legacy system lacked entirely: its uploads were served as static
        // files from a browsable directory, ahead of any authentication.
        await AuthorizeAsync(authorization, http, document, DocumentOperations.Read);

        if (document.FileKey is null)
        {
            throw new NotFoundException("Content for document", id);
        }

        var stream = storage.OpenRead(document.FileKey);
        if (stream is null)
        {
            // The row says there is a file and storage disagrees. That is a data-integrity
            // problem, not a client error, so it is worth surfacing as one.
            throw new ConflictException(
                "This document's content is recorded but missing from storage. " +
                "Contact an administrator.");
        }

        // The content hash doubles as a strong ETag: identical bytes, identical tag.
        var etag = document.FileHash is null ? null : new EntityTagHeaderValue($"\"{document.FileHash}\"");

        return TypedResults.Stream(
            stream,
            contentType: document.ContentType ?? "application/octet-stream",
            fileDownloadName: download == true ? document.FileName : null,
            lastModified: document.UpdatedAt ?? document.CreatedAt,
            entityTag: etag,
            enableRangeProcessing: true);
    }

    private static async Task<NoContent> DeleteAsync(
        Guid id,
        FremaDbContext db,
        IDocumentStorage storage,
        IAuthorizationService authorization,
        IAuditService audit,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        await AuthorizeAsync(authorization, http, document, DocumentOperations.Edit);

        var key = document.FileKey;
        if (key is null)
        {
            return TypedResults.NoContent();
        }

        document.FileKey = null;
        document.FileName = null;
        document.ContentType = null;
        document.FileSizeBytes = null;
        document.FileHash = null;
        document.PageCount = null;
        document.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Record(AuditActions.DocumentContentDeleted, AuditEntityType.Document, document.Id);

        // The row is authoritative: clear it first, then the blob. A crash between the two
        // leaves an orphaned file, which is recoverable; the reverse leaves a document
        // pointing at nothing, which is not.
        await db.SaveChangesAsync(ct);
        storage.Delete(key);

        return TypedResults.NoContent();
    }

    private static async Task AuthorizeAsync(
        IAuthorizationService authorization,
        HttpContext http,
        Document document,
        OperationAuthorizationRequirement operation)
    {
        var result = await authorization.AuthorizeAsync(http.User, document, operation);
        if (!result.Succeeded)
        {
            throw new ForbiddenException(
                $"You are not permitted to {operation.Name!.ToLowerInvariant()} this document.");
        }
    }
}
