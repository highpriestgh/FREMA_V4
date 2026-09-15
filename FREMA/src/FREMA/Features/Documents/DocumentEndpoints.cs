using Duende.Bff;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Features.Workflow;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Documents;

public static class DocumentEndpoints
{
    public static IEndpointRouteBuilder MapDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/documents").WithTags("Documents");

        // Applied as a statement, not chained: AsBffApiEndpoint returns a convention
        // builder, so chaining it would discard the route group.
        group.AsBffApiEndpoint();

        group.MapGet("/", ListAsync)
            .RequireAuthorization(Permissions.ViewDocuments);

        group.MapGet("/{id:guid}", GetAsync)
            .RequireAuthorization(Permissions.ViewDocuments);

        group.MapPost("/", CreateAsync)
            .RequireAuthorization(Permissions.UploadDocuments);

        group.MapPut("/{id:guid}", UpdateAsync)
            .RequireAuthorization(Permissions.EditDocuments);

        // Filing is separate from editing: records staff file documents after approval, when
        // the content is locked and the uploader can no longer change anything.
        group.MapPut("/{id:guid}/folder", MoveToFolderAsync)
            .RequireAuthorization(Permissions.ManageFolders);

        group.MapDelete("/{id:guid}", DeleteAsync)
            .RequireAuthorization(Permissions.ViewDocuments);

        group.MapPost("/{id:guid}/submit", SubmitAsync)
            .RequireAuthorization(Permissions.RouteDocuments);

        group.MapPost("/{id:guid}/decision", DecideAsync)
            .RequireAuthorization(Permissions.ApproveDocuments);

        group.MapGet("/{id:guid}/comments", ListCommentsAsync)
            .RequireAuthorization(Permissions.ViewDocuments);

        group.MapPost("/{id:guid}/comments", AddCommentAsync)
            .RequireAuthorization(Permissions.CommentOnDocuments);

        var inbox = app.MapGet("/api/inbox", InboxAsync)
            .WithTags("Documents")
            .RequireAuthorization(Permissions.ViewDocuments);
        inbox.AsBffApiEndpoint();

        return app;
    }

    /// <summary>
    /// Paged, filtered and sorted. Users see documents they raised or are involved in;
    /// <see cref="Permissions.ViewAllDocuments"/> widens that to everything.
    /// </summary>
    private static async Task<Ok<PagedResult<DocumentSummaryDto>>> ListAsync(
        [AsParameters] DocumentQuery filter,
        [AsParameters] PageRequest page,
        FremaDbContext db,
        ICurrentUser user,
        CancellationToken ct)
    {
        var userId = user.RequireUserId();

        var query = db.Documents.AsNoTracking();

        // The visibility rule, applied in the database rather than by filtering results
        // after the fact — the legacy API returned every document to every caller.
        if (!user.HasPermission(Permissions.ViewAllDocuments))
        {
            query = query.Where(d => d.UploadedById == userId
                                     || d.Routings.Any(r => r.AssignedToId == userId
                                                            || r.RoutedById == userId));
        }

        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var term = filter.Q.Trim();
            query = query.Where(d => EF.Functions.Like(d.Title, $"%{term}%")
                                     || EF.Functions.Like(d.Number, $"%{term}%"));
        }

        if (filter.Status is { } status) query = query.Where(d => d.Status == status);
        if (filter.DocumentTypeId is { } typeId) query = query.Where(d => d.DocumentTypeId == typeId);
        if (filter.OriginId is { } originId) query = query.Where(d => d.OriginId == originId);
        if (filter.FolderId is { } folderId) query = query.Where(d => d.FolderId == folderId);
        if (filter.UploadedById is { } uploader) query = query.Where(d => d.UploadedById == uploader);
        if (filter.CreatedAfter is { } after) query = query.Where(d => d.CreatedAt >= after);
        if (filter.CreatedBefore is { } before) query = query.Where(d => d.CreatedAt <= before);

        query = ApplySort(query, filter.Sort);

        var result = await query
            .Select(d => new DocumentSummaryDto(
                d.Id,
                d.Number,
                d.Title,
                d.Status,
                d.DocumentType!.Name,
                d.Origin!.Name,
                d.UploadedBy.FirstName + " " + d.UploadedBy.LastName,
                d.UploadedById,
                d.CurrentStep!.Name,
                d.FileKey != null,
                d.FileSizeBytes,
                d.CreatedAt,
                d.UpdatedAt))
            .ToPagedResultAsync(page, ct);

        return TypedResults.Ok(result);
    }

    /// <summary>
    /// Whitelisted sort fields. Binding a column name straight from the query string would
    /// be an injection surface; this maps to expressions instead.
    /// </summary>
    private static IQueryable<Document> ApplySort(IQueryable<Document> query, string? sort)
    {
        var descending = sort?.StartsWith('-') ?? false;
        var field = (descending ? sort![1..] : sort)?.ToLowerInvariant();

        return (field, descending) switch
        {
            ("title", false) => query.OrderBy(d => d.Title),
            ("title", true) => query.OrderByDescending(d => d.Title),
            ("number", false) => query.OrderBy(d => d.Number),
            ("number", true) => query.OrderByDescending(d => d.Number),
            ("status", false) => query.OrderBy(d => d.Status),
            ("status", true) => query.OrderByDescending(d => d.Status),
            ("updated", false) => query.OrderBy(d => d.UpdatedAt),
            ("updated", true) => query.OrderByDescending(d => d.UpdatedAt),
            ("created", false) => query.OrderBy(d => d.CreatedAt),
            _ => query.OrderByDescending(d => d.CreatedAt),
        };
    }

    private static async Task<Ok<DocumentDetailDto>> GetAsync(
        Guid id,
        FremaDbContext db,
        IAuthorizationService authorization,
        ICurrentUser user,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await LoadForReadAsync(db, id, ct);
        await AuthorizeAsync(authorization, http, document, DocumentOperations.Read);

        return TypedResults.Ok(ToDetail(document));
    }

    private static async Task<Created<DocumentDetailDto>> CreateAsync(
        CreateDocumentRequest request,
        FremaDbContext db,
        ICurrentUser user,
        IAuditService audit,
        DocumentNumberGenerator numbers,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            throw new DomainRuleException("A title is required.");
        }

        await EnsureReferencesExistAsync(db, request.DocumentTypeId, request.OriginId, request.FolderId, ct);

        var manualNumber = request.Number?.Trim();
        var uploaderId = user.RequireUserId();

        // The number is taken and the document saved in one transaction, so a failed save
        // hands its number back rather than leaving a gap in the register.
        var documentId = await db.InRetriableTransactionAsync(async () =>
        {
            string number;
            if (string.IsNullOrEmpty(manualNumber))
            {
                number = await numbers.NextAsync(ct);
            }
            else if (await db.Documents.AnyAsync(d => d.Number == manualNumber, ct))
            {
                throw new ConflictException($"Document number '{manualNumber}' is already in use.");
            }
            else
            {
                number = manualNumber;
            }

            var document = new Document
            {
                Number = number,
                Title = request.Title.Trim(),
                Summary = request.Summary?.Trim(),
                DocumentTypeId = request.DocumentTypeId,
                OriginId = request.OriginId,
                FolderId = request.FolderId,
                UploadedById = uploaderId,
                Status = DocumentStatus.Draft,
            };

            db.Documents.Add(document);
            audit.Record(AuditActions.DocumentCreated, AuditEntityType.Document, document.Id,
                new { document.Number, document.Title });

            await db.SaveChangesAsync(ct);
            return document.Id;
        }, ct);

        var created = await LoadForReadAsync(db, documentId, ct);
        return TypedResults.Created($"/api/documents/{documentId}", ToDetail(created));
    }

    private static async Task<Ok<DocumentDetailDto>> UpdateAsync(
        Guid id,
        UpdateDocumentRequest request,
        FremaDbContext db,
        IAuthorizationService authorization,
        IAuditService audit,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        await AuthorizeAsync(authorization, http, document, DocumentOperations.Edit);

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            throw new DomainRuleException("A title is required.");
        }

        await EnsureReferencesExistAsync(db, request.DocumentTypeId, request.OriginId, request.FolderId, ct);

        document.Title = request.Title.Trim();
        document.Summary = request.Summary?.Trim();
        document.DocumentTypeId = request.DocumentTypeId;
        document.OriginId = request.OriginId;
        document.FolderId = request.FolderId;
        document.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Record(AuditActions.DocumentUpdated, AuditEntityType.Document, document.Id);
        await db.SaveChangesAsync(ct);

        var updated = await LoadForReadAsync(db, id, ct);
        return TypedResults.Ok(ToDetail(updated));
    }

    public sealed record MoveToFolderRequest(Guid? FolderId);

    /// <summary>
    /// Files a document in a folder, or removes it from one when <c>FolderId</c> is null.
    /// Allowed at any status — approved documents are exactly the ones that get filed — but
    /// only for documents the caller can see.
    /// </summary>
    private static async Task<NoContent> MoveToFolderAsync(
        Guid id,
        MoveToFolderRequest request,
        FremaDbContext db,
        IAuthorizationService authorization,
        IAuditService audit,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        await AuthorizeAsync(authorization, http, document, DocumentOperations.Read);

        string? folderName = null;
        if (request.FolderId is { } folderId)
        {
            folderName = await db.Folders.Where(f => f.Id == folderId).Select(f => f.Name).FirstOrDefaultAsync(ct)
                ?? throw new NotFoundException("Folder", folderId);
        }

        if (document.FolderId == request.FolderId)
        {
            return TypedResults.NoContent();
        }

        var previous = document.FolderId;
        document.FolderId = request.FolderId;
        document.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Record("document.filed", AuditEntityType.Document, id,
            new { From = previous, To = request.FolderId, Folder = folderName });
        await db.SaveChangesAsync(ct);

        return TypedResults.NoContent();
    }

    private static async Task<NoContent> DeleteAsync(
        Guid id,
        FremaDbContext db,
        IAuthorizationService authorization,
        IAuditService audit,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        await AuthorizeAsync(authorization, http, document, DocumentOperations.Delete);

        db.Documents.Remove(document);
        audit.Record(AuditActions.DocumentDeleted, AuditEntityType.Document, document.Id,
            new { document.Number, document.Title });

        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    private static async Task<Ok<DocumentDetailDto>> SubmitAsync(
        Guid id,
        SubmitDocumentRequest request,
        FremaDbContext db,
        WorkflowEngine workflow,
        IAuthorizationService authorization,
        ICurrentUser user,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        await AuthorizeAsync(authorization, http, document, DocumentOperations.Route);

        await workflow.SubmitAsync(document, request.Assignees, user.RequireUserId(), request.Note, ct);
        await db.SaveChangesAsync(ct);

        var submitted = await LoadForReadAsync(db, id, ct);
        return TypedResults.Ok(ToDetail(submitted));
    }

    private static async Task<Ok<DocumentDetailDto>> DecideAsync(
        Guid id,
        DecisionRequest request,
        FremaDbContext db,
        WorkflowEngine workflow,
        IAuthorizationService authorization,
        IAuditService audit,
        ICurrentUser user,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        // Act is the strict one: holding documents.approve is not enough, the caller must
        // have a pending assignment on this document's current step.
        await AuthorizeAsync(authorization, http, document, DocumentOperations.Act);

        await workflow.ActAsync(
            document, user.RequireUserId(), request.Decision, request.Comment,
            request.NextAssignees, ct);

        audit.Record(request.Decision switch
        {
            WorkflowDecision.Approve => AuditActions.DocumentApproved,
            WorkflowDecision.Reject => AuditActions.DocumentRejected,
            _ => AuditActions.DocumentReviewed,
        }, AuditEntityType.Workflow, document.Id, new { request.Comment });

        await db.SaveChangesAsync(ct);

        var decided = await LoadForReadAsync(db, id, ct);
        return TypedResults.Ok(ToDetail(decided));
    }

    private static async Task<Ok<IReadOnlyList<CommentDto>>> ListCommentsAsync(
        Guid id,
        FremaDbContext db,
        IAuthorizationService authorization,
        HttpContext http,
        CancellationToken ct)
    {
        var document = await db.Documents.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        await AuthorizeAsync(authorization, http, document, DocumentOperations.Read);

        var comments = await db.Comments
            .AsNoTracking()
            .Where(c => c.DocumentId == id)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new CommentDto(
                c.Id,
                c.AuthorId,
                c.Author.FirstName + " " + c.Author.LastName,
                c.Text,
                c.CreatedAt,
                c.EditedAt))
            .ToListAsync(ct);

        return TypedResults.Ok<IReadOnlyList<CommentDto>>(comments);
    }

    private static async Task<Created<CommentDto>> AddCommentAsync(
        Guid id,
        AddCommentRequest request,
        FremaDbContext db,
        IAuthorizationService authorization,
        IAuditService audit,
        ICurrentUser user,
        HttpContext http,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            throw new DomainRuleException("A comment cannot be empty.");
        }

        var document = await db.Documents.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("Document", id);

        await AuthorizeAsync(authorization, http, document, DocumentOperations.Comment);

        var comment = new Comment
        {
            DocumentId = id,
            AuthorId = user.RequireUserId(),
            Text = request.Text.Trim(),
        };

        db.Comments.Add(comment);
        audit.Record(AuditActions.CommentAdded, AuditEntityType.Comment, comment.Id,
            new { DocumentId = id });

        await db.SaveChangesAsync(ct);

        var author = await db.Users.AsNoTracking()
            .Where(u => u.Id == comment.AuthorId)
            .Select(u => u.FirstName + " " + u.LastName)
            .FirstAsync(ct);

        return TypedResults.Created(
            $"/api/documents/{id}/comments/{comment.Id}",
            new CommentDto(comment.Id, comment.AuthorId, author, comment.Text, comment.CreatedAt, null));
    }

    /// <summary>What is waiting on the signed-in user right now.</summary>
    private static async Task<Ok<PagedResult<InboxItemDto>>> InboxAsync(
        [AsParameters] PageRequest page,
        FremaDbContext db,
        ICurrentUser user,
        CancellationToken ct)
    {
        var userId = user.RequireUserId();
        var now = DateTimeOffset.UtcNow;

        var result = await db.WorkflowRoutings
            .AsNoTracking()
            .Where(r => r.AssignedToId == userId && r.Status == RoutingStatus.Pending)
            .OrderByDescending(r => r.Priority)
            .ThenBy(r => r.DueDate ?? DateTimeOffset.MaxValue)
            .ThenBy(r => r.RoutedAt)
            .Select(r => new InboxItemDto(
                r.Id,
                r.DocumentId,
                r.Document.Number,
                r.Document.Title,
                r.Document.DocumentType!.Name,
                r.WorkflowStep.Name,
                r.Priority,
                r.Note,
                r.RoutedBy!.FirstName + " " + r.RoutedBy.LastName,
                r.RoutedAt,
                r.DueDate,
                r.DueDate != null && r.DueDate < now,
                r.ReturnedFromRoutingId != null))
            .ToPagedResultAsync(page, ct);

        return TypedResults.Ok(result);
    }

    // --- Helpers -----------------------------------------------------------

    private static async Task<Document> LoadForReadAsync(
        FremaDbContext db, Guid id, CancellationToken ct) =>
        await db.Documents
            .AsNoTracking()
            .Include(d => d.DocumentType)
            .Include(d => d.Origin)
            .Include(d => d.UploadedBy)
            .Include(d => d.WorkflowDefinition!).ThenInclude(w => w.Steps)
            .Include(d => d.CurrentStep)
            .Include(d => d.Routings).ThenInclude(r => r.WorkflowStep)
            .Include(d => d.Routings).ThenInclude(r => r.Department)
            .Include(d => d.Routings).ThenInclude(r => r.AssignedTo)
            .Include(d => d.Routings).ThenInclude(r => r.RoutedBy)
            .Include(d => d.Comments).ThenInclude(c => c.Author)
            .FirstOrDefaultAsync(d => d.Id == id, ct)
        ?? throw new NotFoundException("Document", id);

    /// <summary>
    /// Runs the resource-based check and turns a refusal into a 403. Without this the
    /// permission policy alone would let any approver touch any document.
    /// </summary>
    /// <summary>
    /// Checks that a referenced type, origin and folder exist, so a stale or mistyped id is a
    /// 404 naming what is missing rather than a foreign-key failure surfacing as a 500.
    /// </summary>
    private static async Task EnsureReferencesExistAsync(
        FremaDbContext db, Guid? typeId, Guid? originId, Guid? folderId, CancellationToken ct)
    {
        if (typeId is { } t && !await db.DocumentTypes.AnyAsync(x => x.Id == t, ct))
            throw new NotFoundException("Document type", t);

        if (originId is { } o && !await db.Origins.AnyAsync(x => x.Id == o, ct))
            throw new NotFoundException("Origin", o);

        if (folderId is { } f && !await db.Folders.AnyAsync(x => x.Id == f, ct))
            throw new NotFoundException("Folder", f);
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

    /// <summary>
    /// The step that follows the current one, so the client can prompt for a recipient
    /// before the user approves rather than failing them afterwards.
    /// </summary>
    private static NextStepDto? NextStepOf(Document d)
    {
        if (d.CurrentStep is null || d.WorkflowDefinition is null)
        {
            return null;
        }

        var next = d.WorkflowDefinition.Steps
            .Where(s => s.Order > d.CurrentStep.Order)
            .MinBy(s => s.Order);

        return next is null
            ? null
            : new NextStepDto(
                next.Name,
                next.AssignmentMode == StepAssignmentMode.ChosenAtRuntime,
                next.DepartmentId);
    }

    private static DocumentDetailDto ToDetail(Document d) => new(
        d.Id,
        d.Number,
        d.Title,
        d.Summary,
        d.Status,
        d.DocumentTypeId,
        d.DocumentType?.Name,
        d.OriginId,
        d.Origin?.Name,
        d.FolderId,
        d.UploadedById,
        $"{d.UploadedBy.FirstName} {d.UploadedBy.LastName}",
        d.WorkflowDefinition?.Name,
        d.CurrentStepId,
        d.CurrentStep?.Name,
        NextStepOf(d),
        d.FileKey is null
            ? null
            : new FileMetadataDto(d.FileName, d.ContentType, d.FileSizeBytes, d.PageCount),
        d.CreatedAt,
        d.UpdatedAt,
        d.ClosedAt,
        [.. d.Routings
            .OrderBy(r => r.WorkflowStep.Order)
            .ThenBy(r => r.RoutedAt)
            .Select(r => new RoutingDto(
                r.Id,
                r.WorkflowStep.Name,
                r.WorkflowStep.Order,
                r.Department.Name,
                r.AssignedToId,
                $"{r.AssignedTo.FirstName} {r.AssignedTo.LastName}",
                r.RoutedBy is null ? null : $"{r.RoutedBy.FirstName} {r.RoutedBy.LastName}",
                r.Priority,
                r.Status,
                r.Note,
                r.Decision,
                r.RoutedAt,
                r.DueDate,
                r.ActedAt,
                r.ReturnedFromRoutingId is not null))],
        [.. d.Comments
            .OrderBy(c => c.CreatedAt)
            .Select(c => new CommentDto(
                c.Id,
                c.AuthorId,
                $"{c.Author.FirstName} {c.Author.LastName}",
                c.Text,
                c.CreatedAt,
                c.EditedAt))]);
}
