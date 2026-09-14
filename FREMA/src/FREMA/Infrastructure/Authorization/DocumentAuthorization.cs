using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Infrastructure.Authorization;

/// <summary>
/// What a caller wants to do with a particular document.
/// <para>
/// Holding a permission such as <c>documents.approve</c> says the user may approve
/// <em>something</em>; it says nothing about <em>this</em> document. The legacy API had no
/// concept of the second question — every endpoint carried a bare <c>[Authorize]</c>, so any
/// authenticated user could read, edit or approve any document in the system.
/// </para>
/// </summary>
public static class DocumentOperations
{
    public static readonly OperationAuthorizationRequirement Read = new() { Name = nameof(Read) };
    public static readonly OperationAuthorizationRequirement Edit = new() { Name = nameof(Edit) };
    public static readonly OperationAuthorizationRequirement Delete = new() { Name = nameof(Delete) };

    /// <summary>Approve, reject or review the current step.</summary>
    public static readonly OperationAuthorizationRequirement Act = new() { Name = nameof(Act) };

    /// <summary>Send the document onward to the next step.</summary>
    public static readonly OperationAuthorizationRequirement Route = new() { Name = nameof(Route) };

    public static readonly OperationAuthorizationRequirement Comment = new() { Name = nameof(Comment) };
}

/// <summary>
/// Decides access to a single <see cref="Document"/>.
/// <para>
/// The baseline rule agreed for visibility: a user may see a document if they raised it, if
/// they appear anywhere in its routing history — as an assignee or as the person who routed
/// it — or if they hold <see cref="Permissions.ViewAllDocuments"/>. Everything else narrows
/// from there.
/// </para>
/// </summary>
public sealed class DocumentAuthorizationHandler(FremaDbContext db)
    : AuthorizationHandler<OperationAuthorizationRequirement, Document>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Document document)
    {
        var userId = context.User.GetUserId();
        if (userId is null)
        {
            return;
        }

        var isOwner = document.UploadedById == userId;
        var canViewAll = context.User.HasClaim(Permissions.ClaimType, Permissions.ViewAllDocuments);

        var granted = requirement.Name switch
        {
            nameof(DocumentOperations.Read) or nameof(DocumentOperations.Comment) =>
                isOwner || canViewAll || await IsInRoutingChainAsync(document.Id, userId.Value),

            // Content may only change while the document is with its owner.
            nameof(DocumentOperations.Edit) =>
                isOwner && document.Status is DocumentStatus.Draft or DocumentStatus.Returned,

            // Deleting is limited to an unsubmitted draft; anything that has entered a
            // workflow is part of the record and is archived instead.
            nameof(DocumentOperations.Delete) =>
                (isOwner && document.Status is DocumentStatus.Draft)
                || context.User.HasClaim(Permissions.ClaimType, Permissions.DeleteDocuments),

            // Only the person the current step is actually waiting on may decide it —
            // holding documents.approve is not enough.
            nameof(DocumentOperations.Act) =>
                await HasPendingAssignmentAsync(document, userId.Value),

            // Either the owner sending it on, or the current assignee passing it along.
            nameof(DocumentOperations.Route) =>
                (isOwner && document.Status is DocumentStatus.Draft or DocumentStatus.Returned)
                || await HasPendingAssignmentAsync(document, userId.Value),

            _ => false,
        };

        if (granted)
        {
            context.Succeed(requirement);
        }
    }

    private Task<bool> IsInRoutingChainAsync(Guid documentId, Guid userId) =>
        db.WorkflowRoutings
            .AsNoTracking()
            .AnyAsync(r => r.DocumentId == documentId
                           && (r.AssignedToId == userId || r.RoutedById == userId));

    /// <summary>
    /// True when the document's <em>current</em> step has a pending routing addressed to
    /// this user. Scoping to the current step stops a past participant acting again.
    /// </summary>
    private Task<bool> HasPendingAssignmentAsync(Document document, Guid userId) =>
        document.CurrentStepId is null
            ? Task.FromResult(false)
            : db.WorkflowRoutings
                .AsNoTracking()
                .AnyAsync(r => r.DocumentId == document.Id
                               && r.WorkflowStepId == document.CurrentStepId
                               && r.AssignedToId == userId
                               && r.Status == RoutingStatus.Pending);
}
