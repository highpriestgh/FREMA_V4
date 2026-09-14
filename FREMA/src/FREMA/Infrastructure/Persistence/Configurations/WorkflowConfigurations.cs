using FREMA.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FREMA.Infrastructure.Persistence.Configurations;

public class WorkflowDefinitionConfiguration : IEntityTypeConfiguration<WorkflowDefinition>
{
    public void Configure(EntityTypeBuilder<WorkflowDefinition> builder)
    {
        builder.Property(w => w.Name).HasMaxLength(200).IsRequired();
        builder.Property(w => w.Description).HasMaxLength(1000);

        builder.HasOne(w => w.DocumentType)
            .WithMany()
            .HasForeignKey(w => w.DocumentTypeId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne(w => w.OriginatingDepartment)
            .WithMany()
            .HasForeignKey(w => w.OriginatingDepartmentId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(w => new { w.Name, w.Version }).IsUnique();

        // At most one default route, enforced by the database rather than by convention.
        builder.HasIndex(w => w.IsDefault)
            .IsUnique()
            .HasFilter("[IsDefault] = 1");

        // Supports selecting the most specific matching definition at submission time.
        builder.HasIndex(w => new { w.IsActive, w.DocumentTypeId, w.OriginatingDepartmentId });
    }
}

public class WorkflowStepConfiguration : IEntityTypeConfiguration<WorkflowStep>
{
    public void Configure(EntityTypeBuilder<WorkflowStep> builder)
    {
        builder.Property(s => s.Name).HasMaxLength(200).IsRequired();
        builder.Property(s => s.Instructions).HasMaxLength(2000);

        builder.Property(s => s.AssignmentMode).HasConversion<int>();
        builder.Property(s => s.CompletionPolicy).HasConversion<int>();
        builder.Property(s => s.DefaultPriority).HasConversion<int>();

        builder.HasOne(s => s.WorkflowDefinition)
            .WithMany(w => w.Steps)
            .HasForeignKey(s => s.WorkflowDefinitionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.Department)
            .WithMany()
            .HasForeignKey(s => s.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(s => s.Role)
            .WithMany()
            .HasForeignKey(s => s.RoleId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(s => s.Assignee)
            .WithMany()
            .HasForeignKey(s => s.AssigneeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Steps are ordered and their positions cannot collide within a route.
        builder.HasIndex(s => new { s.WorkflowDefinitionId, s.Order }).IsUnique();

        // The assignment target must match the mode. Enforced in the database so a bad
        // definition cannot be saved by any path, including a future admin import.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_WorkflowStep_AssignmentTarget",
            """
            ([AssignmentMode] = 0 AND [DepartmentId] IS NOT NULL)
            OR ([AssignmentMode] = 1 AND [RoleId] IS NOT NULL)
            OR ([AssignmentMode] = 2 AND [AssigneeId] IS NOT NULL)
            OR ([AssignmentMode] = 3)
            """));

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_WorkflowStep_Order", "[Order] >= 1"));
    }
}
