namespace FREMA.Domain;

/// <summary>
/// A simple admin-managed lookup table: an id, a unique name, a description and an active
/// flag. <see cref="Department"/>, <see cref="DocumentType"/> and <see cref="Origin"/> are
/// all this shape, so their endpoints are written once against this interface rather than
/// three times against the concrete types.
/// </summary>
public interface IReferenceEntity
{
    Guid Id { get; set; }
    string Name { get; set; }
    string? Description { get; set; }
    bool IsActive { get; set; }
    DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// An organisational unit documents are routed to.
/// New to the C# side — the legacy backend routed user-to-user with no department concept,
/// while the prototype UI assumed departments throughout.
/// </summary>
public class Department : IReferenceEntity
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<ApplicationUser> Users { get; set; } = [];
    public ICollection<WorkflowRouting> Routings { get; set; } = [];
}

/// <summary>
/// Category of document — Memo, Letter, Report, Invoice, Policy, Contract.
/// Replaces the legacy <c>Document.Type</c>, a free-text column capped at three characters.
/// </summary>
public class DocumentType : IReferenceEntity
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Document> Documents { get; set; } = [];
}

/// <summary>
/// Where a document came from. Equivalent to the legacy <c>Address</c> table,
/// renamed to match the admin UI, which has always called these "Origins".
/// </summary>
public class Origin : IReferenceEntity
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Document> Documents { get; set; } = [];
}

/// <summary>
/// A node in the filing hierarchy. Self-referencing; a null <see cref="ParentId"/> is a root.
/// Carried over from the legacy backend, which had it — the prototype only had a stub form.
/// </summary>
public class Folder
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }

    /// <summary>Icon name resolved by the client, not a path.</summary>
    public string? Icon { get; set; }

    public Guid? ParentId { get; set; }
    public Folder? Parent { get; set; }
    public ICollection<Folder> Children { get; set; } = [];

    public Guid? OwnerId { get; set; }
    public ApplicationUser? Owner { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }

    public ICollection<Document> Documents { get; set; } = [];
}
