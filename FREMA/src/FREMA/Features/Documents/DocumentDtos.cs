using FREMA.Domain;
using FREMA.Features.Workflow;

namespace FREMA.Features.Documents;

/// <summary>
/// A document as it appears in a list. Metadata only — no file bytes.
/// <para>
/// The legacy list endpoint embedded every document's content as a base64 data URI, so
/// fetching a page of results meant loading every file in the system into memory.
/// </para>
/// </summary>
public sealed record DocumentSummaryDto(
    Guid Id,
    string Number,
    string Title,
    DocumentStatus Status,
    string? DocumentType,
    string? Origin,
    string UploadedBy,
    Guid UploadedById,
    string? CurrentStep,
    bool HasFile,
    long? FileSizeBytes,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);

/// <summary>A document with its workflow history and collaboration trail.</summary>
public sealed record DocumentDetailDto(
    Guid Id,
    string Number,
    string Title,
    string? Summary,
    DocumentStatus Status,
    Guid? DocumentTypeId,
    string? DocumentType,
    Guid? OriginId,
    string? Origin,
    Guid? FolderId,
    Guid UploadedById,
    string UploadedBy,
    string? WorkflowName,
    Guid? CurrentStepId,
    string? CurrentStep,
    NextStepDto? NextStep,
    FileMetadataDto? File,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt,
    DateTimeOffset? ClosedAt,
    IReadOnlyList<RoutingDto> Routings,
    IReadOnlyList<CommentDto> Comments);

/// <summary>
/// Where the document goes if the current step is approved.
/// <para>
/// Lets the client know, <em>before</em> the user commits to approving, whether it must ask
/// them to pick a recipient — and which department to scope that picker to.
/// </para>
/// </summary>
public sealed record NextStepDto(
    string Name,
    bool RequiresRecipientChoice,
    Guid? DepartmentId);

public sealed record FileMetadataDto(
    string? FileName,
    string? ContentType,
    long? SizeBytes,
    int? PageCount);

/// <summary>One person's assignment within one workflow step.</summary>
public sealed record RoutingDto(
    Guid Id,
    string StepName,
    int StepOrder,
    string Department,
    Guid AssignedToId,
    string AssignedTo,
    string? RoutedBy,
    Priority Priority,
    RoutingStatus Status,
    string? Note,
    string? Decision,
    DateTimeOffset RoutedAt,
    DateTimeOffset? DueDate,
    DateTimeOffset? ActedAt,
    bool IsReturn);

public sealed record CommentDto(
    Guid Id,
    Guid AuthorId,
    string Author,
    string Text,
    DateTimeOffset CreatedAt,
    DateTimeOffset? EditedAt);

/// <summary>An item awaiting the signed-in user's action.</summary>
public sealed record InboxItemDto(
    Guid RoutingId,
    Guid DocumentId,
    string Number,
    string Title,
    string? DocumentType,
    string StepName,
    Priority Priority,
    string? Note,
    string? RoutedBy,
    DateTimeOffset RoutedAt,
    DateTimeOffset? DueDate,
    bool IsOverdue,
    bool IsReturn);

// --- Requests --------------------------------------------------------------

public sealed record CreateDocumentRequest(
    string Title,
    string? Number,
    string? Summary,
    Guid? DocumentTypeId,
    Guid? OriginId,
    Guid? FolderId);

public sealed record UpdateDocumentRequest(
    string Title,
    string? Summary,
    Guid? DocumentTypeId,
    Guid? OriginId,
    Guid? FolderId);

/// <summary>
/// Starts the workflow. <paramref name="Assignees"/> is required when the first step
/// chooses its recipients at routing time.
/// </summary>
public sealed record SubmitDocumentRequest(
    IReadOnlyList<Guid>? Assignees,
    string? Note);

/// <summary>
/// A decision on the current step.
/// <para>
/// <paramref name="NextAssignees"/> is required when approving into a step that picks its
/// recipients at routing time — approving and choosing who gets it next are one action, not
/// two, so a document can never land in a step with nobody assigned to it.
/// </para>
/// </summary>
public sealed record DecisionRequest(
    WorkflowDecision Decision,
    string? Comment,
    IReadOnlyList<Guid>? NextAssignees);

public sealed record AddCommentRequest(string Text);

/// <summary>Filters for the document list. All optional; all combinable.</summary>
public sealed record DocumentQuery
{
    /// <summary>Free-text match on number or title.</summary>
    public string? Q { get; init; }

    public DocumentStatus? Status { get; init; }
    public Guid? DocumentTypeId { get; init; }
    public Guid? OriginId { get; init; }
    public Guid? FolderId { get; init; }
    public Guid? UploadedById { get; init; }
    public DateTimeOffset? CreatedAfter { get; init; }
    public DateTimeOffset? CreatedBefore { get; init; }

    /// <summary>One of: created, updated, title, number, status. Prefix with '-' to descend.</summary>
    public string? Sort { get; init; }
}
