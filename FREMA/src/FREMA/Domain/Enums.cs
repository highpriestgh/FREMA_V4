namespace FREMA.Domain;

/// <summary>
/// Lifecycle state of a document.
/// Replaces the legacy <c>Document.Status</c>, which was an unlabelled <c>int</c>.
/// </summary>
public enum DocumentStatus
{
    /// <summary>Created but not yet submitted to a workflow.</summary>
    Draft = 0,

    /// <summary>In a workflow, awaiting action at the current step.</summary>
    Pending = 1,

    /// <summary>
    /// A reviewer rejected their step, so the document has gone back to whoever sent it
    /// for correction and re-submission. Actionable, not terminal.
    /// </summary>
    Returned = 2,

    /// <summary>Cleared the final step. Terminal.</summary>
    Approved = 3,

    /// <summary>Abandoned by its owner after being returned. Terminal.</summary>
    Rejected = 4,

    /// <summary>Closed and retained for the record. Terminal.</summary>
    Archived = 5,
}

/// <summary>
/// Outcome of one assignment within a workflow step. Distinct from
/// <see cref="DocumentStatus"/>: under <see cref="StepCompletionPolicy.Unanimous"/> one
/// assignee may have approved while the step, and the document, are still pending.
/// </summary>
public enum RoutingStatus
{
    Pending = 0,
    Approved = 1,

    /// <summary>Sends the document back to the sender. See <see cref="DocumentStatus.Returned"/>.</summary>
    Rejected = 2,

    /// <summary>Acknowledged without deciding — used by review-only steps.</summary>
    Reviewed = 3,

    /// <summary>Superseded before the assignee acted: the step closed, or routing was recalled.</summary>
    Withdrawn = 4,
}

/// <summary>Urgency of a routing assignment.</summary>
public enum Priority
{
    Low = 0,
    Normal = 1,
    High = 2,
    Urgent = 3,
}

/// <summary>How a workflow step chooses who must act.</summary>
public enum StepAssignmentMode
{
    /// <summary>Everyone in a named department.</summary>
    Department = 0,

    /// <summary>Everyone holding a named role.</summary>
    Role = 1,

    /// <summary>One named person.</summary>
    User = 2,

    /// <summary>
    /// Chosen when the document is routed, constrained to a department.
    /// This is how the legacy system behaved for every hop.
    /// </summary>
    ChosenAtRuntime = 3,
}

/// <summary>How many assignees must act before a step is complete.</summary>
public enum StepCompletionPolicy
{
    /// <summary>The first decision closes the step for everyone.</summary>
    AnyOne = 0,

    /// <summary>Every assignee must approve. One rejection returns the document.</summary>
    Unanimous = 1,
}

/// <summary>Kind of entity an audit entry refers to.</summary>
public enum AuditEntityType
{
    Document = 0,
    Workflow = 1,
    Comment = 2,
    Annotation = 3,
    User = 4,
    Folder = 5,
    Role = 6,
    Session = 7,
    WorkflowDefinition = 8,
}
