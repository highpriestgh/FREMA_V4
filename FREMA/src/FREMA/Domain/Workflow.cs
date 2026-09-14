namespace FREMA.Domain;

/// <summary>
/// A named, admin-configurable approval route.
/// <para>
/// Workflow shape is <em>data, not code</em>. The legacy system hard-coded a single
/// user-to-user hop in T-SQL, and the prototype hard-coded a three-stage enum; neither could
/// express a different organisation's process without a redeploy. An administrator defines
/// routes here and the engine walks whatever steps it finds.
/// </para>
/// </summary>
public class WorkflowDefinition
{
    public Guid Id { get; set; }

    public required string Name { get; set; }
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Fallback route, used when no scoped definition matches. Exactly one definition
    /// may hold this at a time; enforced by a filtered unique index.
    /// </summary>
    public bool IsDefault { get; set; }

    // --- Scope -------------------------------------------------------------
    // Both null means the definition is selectable for any document. The most
    // specific match wins; see WorkflowDefinitionSelector.

    /// <summary>Applies only to documents of this type. Null means any type.</summary>
    public Guid? DocumentTypeId { get; set; }
    public DocumentType? DocumentType { get; set; }

    /// <summary>Applies only to documents raised by this department. Null means any.</summary>
    public Guid? OriginatingDepartmentId { get; set; }
    public Department? OriginatingDepartment { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }

    /// <summary>
    /// A definition in use by a live document must not be edited in place, or running
    /// workflows would change shape underneath their participants. Edits clone instead.
    /// </summary>
    public int Version { get; set; } = 1;

    public ICollection<WorkflowStep> Steps { get; set; } = [];
    public ICollection<Document> Documents { get; set; } = [];
}

/// <summary>
/// One stage of a <see cref="WorkflowDefinition"/>, executed in <see cref="Order"/>.
/// </summary>
public class WorkflowStep
{
    public Guid Id { get; set; }

    public Guid WorkflowDefinitionId { get; set; }
    public WorkflowDefinition WorkflowDefinition { get; set; } = null!;

    /// <summary>Position in the route, ascending from 1. Unique within a definition.</summary>
    public int Order { get; set; }

    /// <summary>Shown in the stepper, e.g. "Head of Department".</summary>
    public required string Name { get; set; }

    public string? Instructions { get; set; }

    // --- Who acts ----------------------------------------------------------

    public StepAssignmentMode AssignmentMode { get; set; } = StepAssignmentMode.ChosenAtRuntime;

    /// <summary>
    /// Required for <see cref="StepAssignmentMode.Department"/>, and for
    /// <see cref="StepAssignmentMode.ChosenAtRuntime"/> where it constrains the choice.
    /// </summary>
    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }

    /// <summary>Required for <see cref="StepAssignmentMode.Role"/>.</summary>
    public Guid? RoleId { get; set; }
    public ApplicationRole? Role { get; set; }

    /// <summary>Required for <see cref="StepAssignmentMode.User"/>.</summary>
    public Guid? AssigneeId { get; set; }
    public ApplicationUser? Assignee { get; set; }

    // --- How it completes --------------------------------------------------

    public StepCompletionPolicy CompletionPolicy { get; set; } = StepCompletionPolicy.AnyOne;

    /// <summary>
    /// Records an acknowledgement rather than a decision. A review-only step cannot
    /// return the document to the sender.
    /// </summary>
    public bool IsReviewOnly { get; set; }

    /// <summary>Days allowed before the step is overdue. Null means no SLA.</summary>
    public int? DueAfterDays { get; set; }

    public Priority DefaultPriority { get; set; } = Priority.Normal;

    public ICollection<WorkflowRouting> Routings { get; set; } = [];
}
