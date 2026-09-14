namespace FREMA.Domain;

/// <summary>
/// Append-only audit entry.
/// <para>
/// Written server-side only. The prototype logged from the browser, which meant the audit
/// trail could be forged or simply skipped by a client that chose not to call it.
/// </para>
/// </summary>
public class AuditLog
{
    public long Id { get; set; }

    /// <summary>Verb, e.g. <c>document.approved</c>.</summary>
    public required string Action { get; set; }

    public AuditEntityType EntityType { get; set; }

    /// <summary>Soft reference — no FK, so any entity can be logged and rows survive deletion.</summary>
    public Guid? EntityId { get; set; }

    /// <summary>Structured detail as JSON.</summary>
    public string? Details { get; set; }

    /// <summary>Null for system-initiated actions such as scheduled reminders.</summary>
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }

    /// <summary>Denormalised so the entry stays readable if the user is later removed.</summary>
    public string? UserName { get; set; }

    public string? IpAddress { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// An in-app notification, delivered over SignalR and persisted so it survives a reload.
/// The legacy table had no read state, so nothing could ever be marked as seen.
/// </summary>
public class Notification
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    public required string Message { get; set; }

    public Guid? DocumentId { get; set; }
    public Document? Document { get; set; }

    /// <summary>Client-side route to open when the notification is clicked.</summary>
    public string? Link { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReadAt { get; set; }
}

/// <summary>
/// A navigation entry. Drives the sidebar only — it is <em>not</em> the security model.
/// <para>
/// The legacy schema spread this over three tables (<c>Menu</c>, <c>MenuRole</c>,
/// <c>MenuRolePermission</c>) and used it as the de facto access control, while the API
/// itself checked nothing. Here a menu item simply names the permission that reveals it,
/// and the same permission independently guards the endpoints behind it.
/// </para>
/// </summary>
public class MenuItem
{
    public Guid Id { get; set; }

    public required string Label { get; set; }

    /// <summary>Client-side route, e.g. <c>/documents</c>.</summary>
    public required string Path { get; set; }

    /// <summary>Icon name resolved by the client.</summary>
    public string? Icon { get; set; }

    public Guid? ParentId { get; set; }
    public MenuItem? Parent { get; set; }
    public ICollection<MenuItem> Children { get; set; } = [];

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>Permission required to see this item. Null means visible to any signed-in user.</summary>
    public Guid? RequiredPermissionId { get; set; }
    public Permission? RequiredPermission { get; set; }
}
