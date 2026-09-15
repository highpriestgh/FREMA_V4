using System.Reflection;
using FREMA.Domain;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Infrastructure.Persistence;

/// <summary>
/// The application's only <see cref="DbContext"/>.
/// <para>
/// The legacy solution ran three — <c>FremaContext</c> and <c>ApplicationDbContext</c> in the
/// API plus another in the STS — all pointed at the same connection string, and the API's
/// modelled the IdentityServer operational tables it had no business owning. IdentityServer's
/// configuration and grant stores stay in their own contexts, supplied by Duende.
/// </para>
/// </summary>
public class FremaDbContext(DbContextOptions<FremaDbContext> options)
    : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>(options)
{
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();

    public DbSet<Department> Departments => Set<Department>();
    public DbSet<DocumentType> DocumentTypes => Set<DocumentType>();
    public DbSet<Origin> Origins => Set<Origin>();
    public DbSet<Folder> Folders => Set<Folder>();

    public DbSet<WorkflowDefinition> WorkflowDefinitions => Set<WorkflowDefinition>();
    public DbSet<WorkflowStep> WorkflowSteps => Set<WorkflowStep>();

    public DbSet<Document> Documents => Set<Document>();
    public DbSet<WorkflowRouting> WorkflowRoutings => Set<WorkflowRouting>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<Annotation> Annotations => Set<Annotation>();

    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();

    public DbSet<SystemSettings> SystemSettings => Set<SystemSettings>();
    public DbSet<DocumentNumberCounter> DocumentNumberCounters => Set<DocumentNumberCounter>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());
    }
}
