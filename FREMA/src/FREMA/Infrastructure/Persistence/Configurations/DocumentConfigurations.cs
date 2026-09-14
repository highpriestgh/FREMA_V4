using FREMA.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FREMA.Infrastructure.Persistence.Configurations;

public class DepartmentConfiguration : IEntityTypeConfiguration<Department>
{
    public void Configure(EntityTypeBuilder<Department> builder)
    {
        builder.Property(d => d.Name).HasMaxLength(150).IsRequired();
        builder.Property(d => d.Description).HasMaxLength(500);
        builder.HasIndex(d => d.Name).IsUnique();
    }
}

public class DocumentTypeConfiguration : IEntityTypeConfiguration<DocumentType>
{
    public void Configure(EntityTypeBuilder<DocumentType> builder)
    {
        builder.Property(t => t.Name).HasMaxLength(150).IsRequired();
        builder.Property(t => t.Description).HasMaxLength(500);
        builder.HasIndex(t => t.Name).IsUnique();
    }
}

public class OriginConfiguration : IEntityTypeConfiguration<Origin>
{
    public void Configure(EntityTypeBuilder<Origin> builder)
    {
        builder.Property(o => o.Name).HasMaxLength(200).IsRequired();
        builder.Property(o => o.Description).HasMaxLength(1000);
        builder.HasIndex(o => o.Name).IsUnique();
    }
}

public class FolderConfiguration : IEntityTypeConfiguration<Folder>
{
    public void Configure(EntityTypeBuilder<Folder> builder)
    {
        builder.Property(f => f.Name).HasMaxLength(200).IsRequired();
        builder.Property(f => f.Description).HasMaxLength(1000);
        builder.Property(f => f.Icon).HasMaxLength(50);

        builder.HasOne(f => f.Parent)
            .WithMany(f => f.Children)
            .HasForeignKey(f => f.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(f => f.Owner)
            .WithMany()
            .HasForeignKey(f => f.OwnerId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(f => f.ParentId);
    }
}

public class DocumentConfiguration : IEntityTypeConfiguration<Document>
{
    public void Configure(EntityTypeBuilder<Document> builder)
    {
        builder.Property(d => d.Number).HasMaxLength(50).IsRequired();
        builder.Property(d => d.Title).HasMaxLength(400).IsRequired();
        builder.Property(d => d.Summary).HasMaxLength(2000);

        builder.Property(d => d.FileKey).HasMaxLength(400);
        builder.Property(d => d.FileName).HasMaxLength(400);
        builder.Property(d => d.ContentType).HasMaxLength(150);
        builder.Property(d => d.FileHash).HasMaxLength(64).IsFixedLength();

        // Stored as int; the enum is the contract, the number is an implementation detail.
        builder.Property(d => d.Status).HasConversion<int>();

        builder.HasOne(d => d.WorkflowDefinition)
            .WithMany(w => w.Documents)
            .HasForeignKey(d => d.WorkflowDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(d => d.CurrentStep)
            .WithMany()
            .HasForeignKey(d => d.CurrentStepId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(d => d.UploadedBy)
            .WithMany(u => u.UploadedDocuments)
            .HasForeignKey(d => d.UploadedById)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(d => d.DocumentType)
            .WithMany(t => t.Documents)
            .HasForeignKey(d => d.DocumentTypeId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne(d => d.Origin)
            .WithMany(o => o.Documents)
            .HasForeignKey(d => d.OriginId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne(d => d.Folder)
            .WithMany(f => f.Documents)
            .HasForeignKey(d => d.FolderId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(d => d.Number).IsUnique();
        builder.HasIndex(d => d.Status);
        builder.HasIndex(d => d.CurrentStepId);
        builder.HasIndex(d => d.UploadedById);
        builder.HasIndex(d => d.CreatedAt);
        builder.HasIndex(d => d.FileHash);
    }
}

public class WorkflowRoutingConfiguration : IEntityTypeConfiguration<WorkflowRouting>
{
    public void Configure(EntityTypeBuilder<WorkflowRouting> builder)
    {
        builder.Property(r => r.Note).HasMaxLength(2000);
        builder.Property(r => r.Decision).HasMaxLength(2000);

        builder.Property(r => r.Priority).HasConversion<int>();
        builder.Property(r => r.Status).HasConversion<int>();

        builder.HasOne(r => r.Document)
            .WithMany(d => d.Routings)
            .HasForeignKey(r => r.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(r => r.WorkflowStep)
            .WithMany(s => s.Routings)
            .HasForeignKey(r => r.WorkflowStepId)
            .OnDelete(DeleteBehavior.Restrict);

        // Self-reference: the hop a rejection sent this one back from.
        builder.HasOne(r => r.ReturnedFromRouting)
            .WithMany()
            .HasForeignKey(r => r.ReturnedFromRoutingId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(r => r.Department)
            .WithMany(d => d.Routings)
            .HasForeignKey(r => r.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        // NoAction on both user FKs: SQL Server rejects multiple cascade paths to the
        // same table, and a routing must outlive neither participant silently.
        builder.HasOne(r => r.AssignedTo)
            .WithMany()
            .HasForeignKey(r => r.AssignedToId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(r => r.RoutedBy)
            .WithMany()
            .HasForeignKey(r => r.RoutedById)
            .OnDelete(DeleteBehavior.NoAction);

        // Drives the inbox query: "what is waiting on me".
        builder.HasIndex(r => new { r.AssignedToId, r.Status });
        builder.HasIndex(r => r.DocumentId);
        builder.HasIndex(r => r.DueDate);
    }
}

public class CommentConfiguration : IEntityTypeConfiguration<Comment>
{
    public void Configure(EntityTypeBuilder<Comment> builder)
    {
        builder.Property(c => c.Text).HasMaxLength(4000).IsRequired();

        builder.HasOne(c => c.Document)
            .WithMany(d => d.Comments)
            .HasForeignKey(c => c.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(c => c.Author)
            .WithMany(u => u.Comments)
            .HasForeignKey(c => c.AuthorId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(c => c.DocumentId);
    }
}

public class AnnotationConfiguration : IEntityTypeConfiguration<Annotation>
{
    public void Configure(EntityTypeBuilder<Annotation> builder)
    {
        builder.Property(a => a.Text).HasMaxLength(2000).IsRequired();

        builder.HasOne(a => a.Document)
            .WithMany(d => d.Annotations)
            .HasForeignKey(a => a.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(a => a.Author)
            .WithMany(u => u.Annotations)
            .HasForeignKey(a => a.AuthorId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(a => new { a.DocumentId, a.PageNumber });
    }
}
