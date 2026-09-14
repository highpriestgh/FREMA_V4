namespace FREMA.Domain;

/// <summary>
/// A document under management.
/// <para>
/// File bytes are <em>never</em> held here. The legacy API round-tripped whole documents as
/// base64 data URIs inside JSON; this records only storage metadata, and the content is
/// streamed through a dedicated authorized endpoint.
/// </para>
/// </summary>
public class Document
{
    public Guid Id { get; set; }

    /// <summary>Human-facing reference, unique across the system.</summary>
    public required string Number { get; set; }

    /// <summary>Legacy capped this at 50 characters, which truncated real document titles.</summary>
    public required string Title { get; set; }

    public string? Summary { get; set; }

    public DocumentStatus Status { get; set; } = DocumentStatus.Draft;

    // --- Workflow position -------------------------------------------------
    // There is no fixed stage enum: the route is chosen from an admin-defined
    // WorkflowDefinition, and position is a pointer into that definition's steps.

    /// <summary>Null while the document is still a draft.</summary>
    public Guid? WorkflowDefinitionId { get; set; }
    public WorkflowDefinition? WorkflowDefinition { get; set; }

    /// <summary>Step currently awaiting action. Null when draft or terminal.</summary>
    public Guid? CurrentStepId { get; set; }
    public WorkflowStep? CurrentStep { get; set; }

    // --- Stored file -------------------------------------------------------
    // Null until content is uploaded; a document may exist as metadata first.

    /// <summary>Opaque storage key. Never a client-supplied name or a filesystem path.</summary>
    public string? FileKey { get; set; }

    /// <summary>Original filename, for the download's Content-Disposition only.</summary>
    public string? FileName { get; set; }

    /// <summary>Content type as sniffed server-side — not as declared by the client.</summary>
    public string? ContentType { get; set; }

    public long? FileSizeBytes { get; set; }

    /// <summary>SHA-256 of the stored bytes. Enables integrity checks and de-duplication.</summary>
    public string? FileHash { get; set; }

    public int? PageCount { get; set; }

    // --- Relationships -----------------------------------------------------

    public Guid UploadedById { get; set; }
    public ApplicationUser UploadedBy { get; set; } = null!;

    public Guid? DocumentTypeId { get; set; }
    public DocumentType? DocumentType { get; set; }

    public Guid? OriginId { get; set; }
    public Origin? Origin { get; set; }

    public Guid? FolderId { get; set; }
    public Folder? Folder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }

    /// <summary>Set when the document reaches a terminal status.</summary>
    public DateTimeOffset? ClosedAt { get; set; }

    public ICollection<WorkflowRouting> Routings { get; set; } = [];
    public ICollection<Comment> Comments { get; set; } = [];
    public ICollection<Annotation> Annotations { get; set; } = [];
}

/// <summary>
/// One person's assignment within one workflow step — the runtime instance of a
/// <see cref="WorkflowStep"/>. A step with several assignees produces several routings.
/// <para>
/// Supersedes the legacy <c>DocInRoute</c>, which had no department, priority, due date
/// or link to any definition.
/// </para>
/// </summary>
public class WorkflowRouting
{
    public Guid Id { get; set; }

    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = null!;

    /// <summary>The step this assignment realises.</summary>
    public Guid WorkflowStepId { get; set; }
    public WorkflowStep WorkflowStep { get; set; } = null!;

    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    /// <summary>The person expected to act.</summary>
    public Guid AssignedToId { get; set; }
    public ApplicationUser AssignedTo { get; set; } = null!;

    /// <summary>
    /// Who sent it here. Null only for the initial submission, where the originator is
    /// <see cref="Document.UploadedById"/>. This is the address a rejection returns to.
    /// </summary>
    public Guid? RoutedById { get; set; }
    public ApplicationUser? RoutedBy { get; set; }

    public Priority Priority { get; set; } = Priority.Normal;
    public RoutingStatus Status { get; set; } = RoutingStatus.Pending;

    /// <summary>Instruction written when routing.</summary>
    public string? Note { get; set; }

    /// <summary>Reason recorded when acting. Required on rejection.</summary>
    public string? Decision { get; set; }

    /// <summary>
    /// Set when this routing exists because an onward step was rejected — it points at the
    /// rejecting routing, so the inbox can show <em>why</em> a document came back.
    /// </summary>
    public Guid? ReturnedFromRoutingId { get; set; }
    public WorkflowRouting? ReturnedFromRouting { get; set; }

    public DateTimeOffset RoutedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DueDate { get; set; }

    /// <summary>Set when the assignee approves, rejects or reviews.</summary>
    public DateTimeOffset? ActedAt { get; set; }
}

/// <summary>A review comment on a document. Equivalent to the legacy <c>DocumentToComment</c>.</summary>
public class Comment
{
    public Guid Id { get; set; }

    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = null!;

    public Guid AuthorId { get; set; }
    public ApplicationUser Author { get; set; } = null!;

    public required string Text { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EditedAt { get; set; }
}

/// <summary>
/// A positioned note on a page of a document. New to the C# side — the prototype had it,
/// the legacy backend did not.
/// </summary>
public class Annotation
{
    public Guid Id { get; set; }

    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = null!;

    public Guid AuthorId { get; set; }
    public ApplicationUser Author { get; set; } = null!;

    public required string Text { get; set; }

    public int PageNumber { get; set; } = 1;

    /// <summary>Position as a fraction of page width/height, so it survives zoom and re-render.</summary>
    public double X { get; set; }
    public double Y { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
