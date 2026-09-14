using Microsoft.AspNetCore.Identity;

namespace FREMA.Domain;

/// <summary>
/// Application user. Keys are <see cref="Guid"/> rather than the default <c>string</c>,
/// so the legacy <c>Guid.Parse(UsrId)</c> on every request disappears along with the
/// exception it threw on a malformed claim.
/// </summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public required string FirstName { get; set; }
    public required string LastName { get; set; }

    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }

    /// <summary>Storage key of the profile picture. Never a file path or base64 blob.</summary>
    public string? ProfilePictureKey { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>Forces a password change at next sign-in (legacy <c>FirstTimeLogin</c>).</summary>
    public bool MustChangePassword { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? PasswordChangedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }

    public string FullName => $"{FirstName} {LastName}".Trim();

    public ICollection<Document> UploadedDocuments { get; set; } = [];
    public ICollection<Comment> Comments { get; set; } = [];
    public ICollection<Annotation> Annotations { get; set; } = [];
    public ICollection<Notification> Notifications { get; set; } = [];
}

/// <summary>
/// Application role.
/// <para>
/// The legacy database carried <em>two</em> parallel RBAC models — ASP.NET Identity's
/// <c>AspNetRoles</c>/<c>AspNetUserRoles</c> and a hand-rolled <c>Role</c>/<c>UserRole</c>
/// pair. Only Identity's survives here; <see cref="Permission"/> layers on top of it.
/// </para>
/// </summary>
public class ApplicationRole : IdentityRole<Guid>
{
    public string? Description { get; set; }

    /// <summary>Built-in roles cannot be renamed or deleted through the admin UI.</summary>
    public bool IsSystemRole { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<RolePermission> RolePermissions { get; set; } = [];
}

/// <summary>
/// A single capability. Granted to roles, surfaced as claims, and enforced by an
/// authorization policy of the same name — the legacy system stored these but never
/// checked them, gating only the menu.
/// </summary>
public class Permission
{
    public Guid Id { get; set; }

    /// <summary>Stable machine name, e.g. <c>documents.approve</c>. See <see cref="Permissions"/>.</summary>
    public required string Name { get; set; }

    public required string DisplayName { get; set; }
    public string? Description { get; set; }

    /// <summary>Grouping for the admin UI, e.g. "Documents", "Administration".</summary>
    public required string Category { get; set; }

    public ICollection<RolePermission> RolePermissions { get; set; } = [];
}

/// <summary>Grant of a <see cref="Permission"/> to an <see cref="ApplicationRole"/>.</summary>
public class RolePermission
{
    public Guid RoleId { get; set; }
    public ApplicationRole Role { get; set; } = null!;

    public Guid PermissionId { get; set; }
    public Permission Permission { get; set; } = null!;

    public DateTimeOffset GrantedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Canonical permission names. Each becomes an authorization policy at startup, so a
/// typo fails fast at registration rather than silently allowing a request through.
/// </summary>
public static class Permissions
{
    public const string ViewDocuments = "documents.view";
    public const string ViewAllDocuments = "documents.view.all";
    public const string UploadDocuments = "documents.upload";
    public const string EditDocuments = "documents.edit";
    public const string DeleteDocuments = "documents.delete";
    public const string ApproveDocuments = "documents.approve";
    public const string RouteDocuments = "documents.route";
    public const string CommentOnDocuments = "documents.comment";

    public const string ManageFolders = "folders.manage";
    public const string ViewReports = "reports.view";
    public const string ViewAudit = "audit.view";

    public const string ManageUsers = "admin.users";
    public const string ManageRoles = "admin.roles";
    public const string ManageOrigins = "admin.origins";
    public const string ManageDocumentTypes = "admin.types";
    public const string ManageDepartments = "admin.departments";
    public const string ManageSettings = "admin.settings";

    /// <summary>Every permission, for policy registration and seeding.</summary>
    public static readonly IReadOnlyList<string> All =
    [
        ViewDocuments, ViewAllDocuments, UploadDocuments, EditDocuments, DeleteDocuments,
        ApproveDocuments, RouteDocuments, CommentOnDocuments,
        ManageFolders, ViewReports, ViewAudit,
        ManageUsers, ManageRoles, ManageOrigins, ManageDocumentTypes,
        ManageDepartments, ManageSettings,
    ];

    /// <summary>Claim type carrying a granted permission in the session cookie.</summary>
    public const string ClaimType = "frema:permission";
}
