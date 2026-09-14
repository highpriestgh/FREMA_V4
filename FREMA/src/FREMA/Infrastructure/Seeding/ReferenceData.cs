using FREMA.Domain;

namespace FREMA.Infrastructure.Seeding;

/// <summary>
/// The reference data a fresh FREMA installation needs to function.
/// <para>
/// Held as data rather than SQL so it is reviewable in a diff, and so the seeder can be
/// idempotent against it. The legacy system had no seeding story at all — its database was
/// built by hand and could not be reconstructed, which is why none of it survives.
/// </para>
/// </summary>
public static class ReferenceData
{
    /// <summary>Display name and grouping for each permission in <see cref="Permissions.All"/>.</summary>
    public static readonly IReadOnlyDictionary<string, (string Display, string Category)> PermissionCatalogue =
        new Dictionary<string, (string, string)>
        {
            [Permissions.ViewDocuments] = ("View documents", "Documents"),
            [Permissions.ViewAllDocuments] = ("View all documents", "Documents"),
            [Permissions.UploadDocuments] = ("Upload documents", "Documents"),
            [Permissions.EditDocuments] = ("Edit documents", "Documents"),
            [Permissions.DeleteDocuments] = ("Delete documents", "Documents"),
            [Permissions.ApproveDocuments] = ("Approve documents", "Workflow"),
            [Permissions.RouteDocuments] = ("Route documents", "Workflow"),
            [Permissions.CommentOnDocuments] = ("Comment on documents", "Documents"),
            [Permissions.ManageFolders] = ("Manage folders", "Documents"),
            [Permissions.ViewReports] = ("View reports", "Insights"),
            [Permissions.ViewAudit] = ("View audit trail", "Insights"),
            [Permissions.ManageUsers] = ("Manage users", "Administration"),
            [Permissions.ManageRoles] = ("Manage roles", "Administration"),
            [Permissions.ManageOrigins] = ("Manage origins", "Administration"),
            [Permissions.ManageDocumentTypes] = ("Manage document types", "Administration"),
            [Permissions.ManageDepartments] = ("Manage departments", "Administration"),
            [Permissions.ManageSettings] = ("Manage settings", "Administration"),
        };

    public const string AdministratorRole = "Administrator";
    public const string ManagerRole = "Manager";
    public const string RecordOfficerRole = "Record Officer";
    public const string EditorRole = "Editor";
    public const string ViewerRole = "Viewer";

    /// <summary>
    /// Role definitions, carried across from the prototype's permission map so the five
    /// role names users already know keep their meaning.
    /// </summary>
    public static readonly IReadOnlyList<RoleSeed> Roles =
    [
        new(AdministratorRole, "Unrestricted access to every part of the system.",
            [.. Permissions.All]),

        new(ManagerRole, "Approves and routes documents; sees reporting and the audit trail.",
        [
            Permissions.ViewDocuments, Permissions.ViewAllDocuments, Permissions.ApproveDocuments,
            Permissions.RouteDocuments, Permissions.CommentOnDocuments, Permissions.ViewReports,
            Permissions.ViewAudit,
        ]),

        new(RecordOfficerRole, "Registers incoming documents and moves them through the office.",
        [
            Permissions.ViewDocuments, Permissions.UploadDocuments, Permissions.EditDocuments,
            Permissions.RouteDocuments, Permissions.CommentOnDocuments, Permissions.ManageFolders,
        ]),

        new(EditorRole, "Creates and edits documents without workflow authority.",
        [
            Permissions.ViewDocuments, Permissions.UploadDocuments, Permissions.EditDocuments,
            Permissions.CommentOnDocuments, Permissions.ViewReports,
        ]),

        new(ViewerRole, "Read-only access to documents they are involved with.",
        [
            Permissions.ViewDocuments,
        ]),
    ];

    public static readonly IReadOnlyList<string> Departments =
    [
        "Finance", "Legal", "Human Resources", "Operations",
        "Information Technology", "Executive Office",
    ];

    public static readonly IReadOnlyList<(string Name, string Description)> DocumentTypes =
    [
        ("Memo", "Internal communication between departments."),
        ("Letter", "Formal correspondence, inbound or outbound."),
        ("Report", "Analytical or periodic reporting."),
        ("Invoice", "Billing and payment documentation."),
        ("Policy", "Governing policy and procedure."),
        ("Contract", "Agreements and binding instruments."),
    ];

    public static readonly IReadOnlyList<(string Name, string Description)> Origins =
    [
        ("Internal", "Raised within the organisation."),
        ("Government Agency", "Received from a government body."),
        ("Client", "Received from a client or customer."),
        ("Supplier", "Received from a supplier or contractor."),
        ("Regulator", "Received from a regulatory authority."),
    ];

    /// <summary>
    /// Navigation, mirroring the routes the SPA will expose. Each entry names the permission
    /// that reveals it; the same permission independently guards the endpoints behind it.
    /// </summary>
    public static readonly IReadOnlyList<MenuSeed> Menu =
    [
        new("Dashboard", "/dashboard", "layout-dashboard", 10, null),
        new("Inbox", "/inbox", "inbox", 20, Permissions.ViewDocuments),
        new("Documents", "/documents", "files", 30, Permissions.ViewDocuments),
        new("Upload", "/upload", "upload", 40, Permissions.UploadDocuments),
        new("Workflows", "/workflows", "git-branch", 50, Permissions.RouteDocuments),
        new("Reports", "/reports", "chart-bar", 60, Permissions.ViewReports),
        new("Audit", "/audit", "shield-check", 70, Permissions.ViewAudit),

        new("Administration", "/admin", "settings", 80, null,
        [
            new("Users", "/admin/users", "users", 10, Permissions.ManageUsers),
            new("Roles", "/admin/roles", "key", 20, Permissions.ManageRoles),
            new("Departments", "/admin/departments", "building", 30, Permissions.ManageDepartments),
            new("Document Types", "/admin/types", "tag", 40, Permissions.ManageDocumentTypes),
            new("Origins", "/admin/origins", "map-pin", 50, Permissions.ManageOrigins),
            new("Workflows", "/admin/workflows", "route", 60, Permissions.ManageSettings),
            new("Settings", "/admin/settings", "sliders", 70, Permissions.ManageSettings),
        ]),
    ];

    /// <summary>Name of the fallback route every document uses unless a scoped one matches.</summary>
    public const string DefaultWorkflowName = "Standard Approval";

    public sealed record RoleSeed(string Name, string Description, IReadOnlyList<string> Permissions);

    public sealed record MenuSeed(
        string Label,
        string Path,
        string Icon,
        int SortOrder,
        string? RequiredPermission,
        IReadOnlyList<MenuSeed>? Children = null);
}
