using FREMA.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FREMA.Infrastructure.Persistence.Configurations;

public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.Property(a => a.Action).HasMaxLength(100).IsRequired();
        builder.Property(a => a.UserName).HasMaxLength(256);
        builder.Property(a => a.IpAddress).HasMaxLength(45); // IPv6
        builder.Property(a => a.EntityType).HasConversion<int>();

        // SetNull, not Cascade: removing a user must never erase their audit history.
        builder.HasOne(a => a.User)
            .WithMany()
            .HasForeignKey(a => a.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(a => a.CreatedAt);
        builder.HasIndex(a => a.UserId);
        builder.HasIndex(a => new { a.EntityType, a.EntityId });
    }
}

public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.Property(n => n.Message).HasMaxLength(1000).IsRequired();
        builder.Property(n => n.Link).HasMaxLength(400);

        builder.HasOne(n => n.User)
            .WithMany(u => u.Notifications)
            .HasForeignKey(n => n.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(n => n.Document)
            .WithMany()
            .HasForeignKey(n => n.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        // Drives the unread badge.
        builder.HasIndex(n => new { n.UserId, n.ReadAt });
    }
}

public class SystemSettingsConfiguration : IEntityTypeConfiguration<SystemSettings>
{
    public void Configure(EntityTypeBuilder<SystemSettings> builder)
    {
        builder.Property(s => s.Id).ValueGeneratedNever();
        builder.Property(s => s.OrganisationName).HasMaxLength(200).IsRequired();
        builder.Property(s => s.LogoContentType).HasMaxLength(50);
        builder.Property(s => s.NumberPrefix).HasMaxLength(10).IsRequired();
        builder.Property(s => s.AllowedExtensions).HasMaxLength(500).IsRequired();
        builder.Property(s => s.UpdatedBy).HasMaxLength(256);

        // One row, always. The check keeps a second settings row from ever being inserted.
        builder.ToTable(t => t.HasCheckConstraint("CK_SystemSettings_Singleton", "[Id] = 1"));

        // The row is created by the migration, so reading settings never has to cope with
        // it being absent.
        builder.HasData(new SystemSettings { Id = SystemSettings.SingletonId });
    }
}

public class DocumentNumberCounterConfiguration : IEntityTypeConfiguration<DocumentNumberCounter>
{
    public void Configure(EntityTypeBuilder<DocumentNumberCounter> builder)
    {
        builder.HasKey(c => c.Scope);
        builder.Property(c => c.Scope).HasMaxLength(20);
    }
}

public class MenuItemConfiguration : IEntityTypeConfiguration<MenuItem>
{
    public void Configure(EntityTypeBuilder<MenuItem> builder)
    {
        builder.Property(m => m.Label).HasMaxLength(100).IsRequired();
        builder.Property(m => m.Path).HasMaxLength(200).IsRequired();
        builder.Property(m => m.Icon).HasMaxLength(50);

        builder.HasOne(m => m.Parent)
            .WithMany(m => m.Children)
            .HasForeignKey(m => m.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(m => m.RequiredPermission)
            .WithMany()
            .HasForeignKey(m => m.RequiredPermissionId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(m => m.SortOrder);
    }
}
