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
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            throw new DomainRuleException("A title is required.");
        }

        var number = request.Number?.Trim();
        if (string.IsNullOrEmpty(number))
        {
            number = GenerateNumber();
        }
        else if (await db.Documents.AnyAsync(d => d.Number == number, ct))
        {
            throw new ConflictException($"Document number '{number}' is already in use.");
        }

        var document = new Document
        {
            Number = number,
            Title = request.Title.Trim(),
            Summary = request.Summary?.Trim(),
            DocumentTypeId = request.DocumentTypeId,
            OriginId = request.OriginId,
            FolderId = request.FolderId,
            UploadedById = user.RequireUserId(),
            Status = DocumentStatus.Draft,
        };

        db.Documents.Add(document);
        audit.Record(AuditActions.DocumentCreated, AuditEntityType.Document, document.Id,
            new { document.Number, document.Title });

        await db.SaveChangesAsync(ct);

        var created = await LoadForReadAsync(db, document.Id, ct);
        return TypedResults.Created($"/api/documents/{document.Id}", ToDetail(created));
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
    /// A unique, non-guessable reference.
    /// <para>
    /// <b>Open decision:</b> a records office usually wants a strictly sequential register
    /// number. That needs a database sequence to stay gap-free under concurrency, which this
    /// deliberately does not fake. Callers may supply their own number instead.
    /// </para>
    /// </summary>
    private static string GenerateNumber() =>
        $"FR-{DateTimeOffset.UtcNow:yyyy}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";

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
