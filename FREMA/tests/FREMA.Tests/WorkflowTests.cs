using System.Net;
using System.Net.Http.Json;
using FREMA.Domain;
using FREMA.Features.Documents;
using FREMA.Features.Workflow;
using FREMA.Infrastructure.Seeding;
using FREMA.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FREMA.Tests;

/// <summary>
/// Approval routes end to end, through the HTTP API, as the people involved.
/// <para>
/// The rules under test were reconstructed when the stored procedures were lost (rebuild plan
/// §1.3): a rejection is never terminal, it returns the document to whoever sent it; a
/// returned document resumes rather than restarts; only the person the current step is
/// waiting on may decide it.
/// </para>
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class WorkflowTests(FremaFactory factory)
{
    private readonly TestData _data = new(factory);

    /// <summary>
    /// The seeded "Standard Approval" route: Review, then Approval, each choosing its recipient
    /// when the document is routed. Documents without a type use it.
    /// </summary>
    private sealed record Cast(
        Guid OwnerId, HttpClient Owner,
        Guid ReviewerId, HttpClient Reviewer,
        Guid ApproverId, HttpClient Approver);

    private async Task<Cast> CastAsync()
    {
        var registry = await _data.DepartmentAsync();
        var finance = await _data.DepartmentAsync();
        var executive = await _data.DepartmentAsync();

        var owner = await _data.UserAsync(ReferenceData.RecordOfficerRole, registry);
        var reviewer = await _data.UserAsync(ReferenceData.ManagerRole, finance);
        var approver = await _data.UserAsync(ReferenceData.ManagerRole, executive);

        return new Cast(
            owner, _data.ClientFor(owner),
            reviewer, _data.ClientFor(reviewer),
            approver, _data.ClientFor(approver));
    }

    [Fact]
    public async Task Approved_at_every_step_completes_the_document()
    {
        var cast = await CastAsync();
        var document = await cast.Owner.CreateAsync();
        Assert.Equal(DocumentStatus.Draft, document.Status);

        var submitted = await (await cast.Owner.SubmitAsync(document.Id, cast.ReviewerId)).ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Pending, submitted.Status);
        Assert.Equal("Review", submitted.CurrentStep);
        Assert.Single(submitted.PendingFor(cast.ReviewerId));

        var reviewed = await (await cast.Reviewer.DecideAsync(document.Id, WorkflowDecision.Approve, null, cast.ApproverId))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal("Approval", reviewed.CurrentStep);
        Assert.Single(reviewed.PendingFor(cast.ApproverId));

        var approved = await (await cast.Approver.DecideAsync(document.Id, WorkflowDecision.Approve))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Approved, approved.Status);
        Assert.Null(approved.CurrentStepId);
        Assert.NotNull(approved.ClosedAt);
        Assert.DoesNotContain(approved.Routings, r => r.Status == RoutingStatus.Pending);
    }

    [Fact]
    public async Task Rejection_returns_to_the_sender_who_resumes_without_restarting()
    {
        var cast = await CastAsync();
        var document = await cast.Owner.CreateAsync();
        await (await cast.Owner.SubmitAsync(document.Id, cast.ReviewerId)).ReadAsync<DocumentDetailDto>();
        await (await cast.Reviewer.DecideAsync(document.Id, WorkflowDecision.Approve, null, cast.ApproverId))
            .ReadAsync<DocumentDetailDto>();

        var returned = await (await cast.Approver.DecideAsync(document.Id, WorkflowDecision.Reject, "Missing signature"))
            .ReadAsync<DocumentDetailDto>();

        // Back one step, to the reviewer who sent it, carrying the reason.
        Assert.Equal(DocumentStatus.Returned, returned.Status);
        Assert.Equal("Review", returned.CurrentStep);
        var bounce = Assert.Single(returned.PendingFor(cast.ReviewerId));
        Assert.True(bounce.IsReturn);
        Assert.Equal("Missing signature", bounce.Note);

        // Re-submitting from the start would throw away the reviewer's approval.
        var restart = await cast.Owner.SubmitAsync(document.Id, cast.ReviewerId);
        Assert.Equal(HttpStatusCode.Conflict, restart.StatusCode);

        // Resuming: the reviewer sends it forward again, and it completes.
        var resumed = await (await cast.Reviewer.DecideAsync(document.Id, WorkflowDecision.Approve, null, cast.ApproverId))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Pending, resumed.Status);
        Assert.Equal("Approval", resumed.CurrentStep);

        var approved = await (await cast.Approver.DecideAsync(document.Id, WorkflowDecision.Approve))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Approved, approved.Status);
    }

    [Fact]
    public async Task Rejection_at_the_first_step_returns_to_the_owner_who_can_edit_and_resubmit()
    {
        var cast = await CastAsync();
        var document = await cast.Owner.CreateAsync();
        await (await cast.Owner.SubmitAsync(document.Id, cast.ReviewerId)).ReadAsync<DocumentDetailDto>();

        var returned = await (await cast.Reviewer.DecideAsync(document.Id, WorkflowDecision.Reject, "Wrong form"))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Returned, returned.Status);
        Assert.Null(returned.CurrentStepId);
        Assert.DoesNotContain(returned.Routings, r => r.Status == RoutingStatus.Pending);

        var edited = await cast.Owner.PutAsJsonAsync($"/api/documents/{document.Id}",
            new UpdateDocumentRequest("Corrected title", "Now on the right form", null, null, null));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);

        var resubmitted = await (await cast.Owner.SubmitAsync(document.Id, cast.ReviewerId)).ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Pending, resubmitted.Status);
        Assert.Equal("Review", resubmitted.CurrentStep);
    }

    [Fact]
    public async Task A_rejection_needs_a_reason()
    {
        var cast = await CastAsync();
        var document = await cast.Owner.CreateAsync();
        await (await cast.Owner.SubmitAsync(document.Id, cast.ReviewerId)).ReadAsync<DocumentDetailDto>();

        var response = await cast.Reviewer.DecideAsync(document.Id, WorkflowDecision.Reject, "   ");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var unchanged = await cast.Owner.GetDocumentAsync(document.Id);
        Assert.Equal(DocumentStatus.Pending, unchanged.Status);
        Assert.Single(unchanged.PendingFor(cast.ReviewerId));
    }

    [Fact]
    public async Task Only_the_person_the_step_is_waiting_on_may_decide_it()
    {
        var cast = await CastAsync();
        var bystanderId = await _data.UserAsync(ReferenceData.ManagerRole, await _data.DepartmentAsync());
        var bystander = _data.ClientFor(bystanderId);

        var document = await cast.Owner.CreateAsync();
        await (await cast.Owner.SubmitAsync(document.Id, cast.ReviewerId)).ReadAsync<DocumentDetailDto>();

        // Holding documents.approve is not enough without an assignment.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await bystander.DecideAsync(document.Id, WorkflowDecision.Approve, null, cast.ApproverId)).StatusCode);

        // The owner lacks documents.approve altogether.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await cast.Owner.DecideAsync(document.Id, WorkflowDecision.Approve, null, cast.ApproverId)).StatusCode);

        await (await cast.Reviewer.DecideAsync(document.Id, WorkflowDecision.Approve, null, cast.ApproverId))
            .ReadAsync<DocumentDetailDto>();

        // A past participant cannot act again on a later step.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await cast.Reviewer.DecideAsync(document.Id, WorkflowDecision.Approve)).StatusCode);
    }

    [Fact]
    public async Task Approving_into_a_step_that_chooses_its_recipient_requires_one()
    {
        var cast = await CastAsync();
        var document = await cast.Owner.CreateAsync();
        await (await cast.Owner.SubmitAsync(document.Id, cast.ReviewerId)).ReadAsync<DocumentDetailDto>();

        var response = await cast.Reviewer.DecideAsync(document.Id, WorkflowDecision.Approve);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var unchanged = await cast.Owner.GetDocumentAsync(document.Id);
        Assert.Equal("Review", unchanged.CurrentStep);
        Assert.Single(unchanged.PendingFor(cast.ReviewerId));
    }

    [Fact]
    public async Task A_unanimous_step_waits_for_everyone()
    {
        var (owner, document, firstId, secondId) =
            await SingleDepartmentStepAsync(StepCompletionPolicy.Unanimous);

        var afterFirst = await (await _data.ClientFor(firstId).DecideAsync(document, WorkflowDecision.Approve))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Pending, afterFirst.Status);
        Assert.Single(afterFirst.PendingFor(secondId));

        var afterSecond = await (await _data.ClientFor(secondId).DecideAsync(document, WorkflowDecision.Approve))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Approved, afterSecond.Status);
    }

    [Fact]
    public async Task One_rejection_in_a_unanimous_step_returns_the_document_and_withdraws_the_rest()
    {
        var (owner, document, firstId, secondId) =
            await SingleDepartmentStepAsync(StepCompletionPolicy.Unanimous);

        var returned = await (await _data.ClientFor(firstId).DecideAsync(document, WorkflowDecision.Reject, "Over budget"))
            .ReadAsync<DocumentDetailDto>();

        Assert.Equal(DocumentStatus.Returned, returned.Status);
        var routings = await _data.ForDocumentAsync(document);
        Assert.Equal(RoutingStatus.Withdrawn, routings.Single(r => r.AssignedToId == secondId).Status);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync(document)).StatusCode);
    }

    [Fact]
    public async Task In_an_any_one_step_the_first_decision_closes_it_for_everyone()
    {
        var (_, document, firstId, secondId) =
            await SingleDepartmentStepAsync(StepCompletionPolicy.AnyOne);

        var approved = await (await _data.ClientFor(firstId).DecideAsync(document, WorkflowDecision.Approve))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Approved, approved.Status);

        var routings = await _data.ForDocumentAsync(document);
        Assert.Equal(RoutingStatus.Withdrawn, routings.Single(r => r.AssignedToId == secondId).Status);

        // Their withdrawn assignment no longer lets them act.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await _data.ClientFor(secondId).DecideAsync(document, WorkflowDecision.Approve)).StatusCode);
    }

    [Fact]
    public async Task A_review_only_step_records_acknowledgement_and_cannot_return_the_document()
    {
        var type = await _data.DocumentTypeAsync();
        var reviewerId = await _data.UserAsync(ReferenceData.ManagerRole, await _data.DepartmentAsync());
        await _data.WorkflowAsync(type, new WorkflowStep
        {
            Name = "For information",
            AssignmentMode = StepAssignmentMode.User,
            AssigneeId = reviewerId,
            IsReviewOnly = true,
        });

        var owner = _data.ClientFor(await _data.UserAsync(ReferenceData.RecordOfficerRole, await _data.DepartmentAsync()));
        var document = await owner.CreateAsync(type);
        await (await owner.SubmitAsync(document.Id)).ReadAsync<DocumentDetailDto>();

        var reviewer = _data.ClientFor(reviewerId);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,
            (await reviewer.DecideAsync(document.Id, WorkflowDecision.Reject, "No")).StatusCode);

        var acknowledged = await (await reviewer.DecideAsync(document.Id, WorkflowDecision.Review))
            .ReadAsync<DocumentDetailDto>();
        Assert.Equal(DocumentStatus.Approved, acknowledged.Status);
        Assert.Contains(acknowledged.Routings, r => r.AssignedToId == reviewerId && r.Status == RoutingStatus.Reviewed);
    }

    [Fact]
    public async Task A_chosen_recipient_must_belong_to_the_department_the_step_names()
    {
        var type = await _data.DocumentTypeAsync();
        var legal = await _data.DepartmentAsync();
        var insiderId = await _data.UserAsync(ReferenceData.ManagerRole, legal);
        var outsiderId = await _data.UserAsync(ReferenceData.ManagerRole, await _data.DepartmentAsync());
        await _data.WorkflowAsync(type, new WorkflowStep
        {
            Name = "Legal review",
            AssignmentMode = StepAssignmentMode.ChosenAtRuntime,
            DepartmentId = legal,
        });

        var owner = _data.ClientFor(await _data.UserAsync(ReferenceData.RecordOfficerRole, await _data.DepartmentAsync()));
        var document = await owner.CreateAsync(type);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await owner.SubmitAsync(document.Id, outsiderId)).StatusCode);

        var submitted = await (await owner.SubmitAsync(document.Id, insiderId)).ReadAsync<DocumentDetailDto>();
        Assert.Single(submitted.PendingFor(insiderId));
    }

    [Fact]
    public async Task The_most_specific_active_route_is_chosen()
    {
        var type = await _data.DocumentTypeAsync();
        var department = await _data.DepartmentAsync();
        var otherDepartment = await _data.DepartmentAsync();

        var (typeOnly, typeAndDepartment, departmentOnly) = await _data.WithDbAsync(async db =>
        {
            WorkflowDefinition Route(Guid? typeId, Guid? departmentId) => new()
            {
                Name = $"Route {Guid.NewGuid():N}",
                DocumentTypeId = typeId,
                OriginatingDepartmentId = departmentId,
                Steps = [new WorkflowStep { Order = 1, Name = "Only step" }],
            };

            var a = Route(type, null);
            var b = Route(type, department);
            var c = Route(null, department);
            db.WorkflowDefinitions.AddRange(a, b, c);
            await db.SaveChangesAsync();
            return (a.Id, b.Id, c.Id);
        });

        using var scope = factory.Services.CreateScope();
        var engine = scope.ServiceProvider.GetRequiredService<WorkflowEngine>();

        Assert.Equal(typeAndDepartment, (await engine.SelectDefinitionAsync(type, department)).Id);
        Assert.Equal(typeOnly, (await engine.SelectDefinitionAsync(type, otherDepartment)).Id);
        Assert.Equal(departmentOnly, (await engine.SelectDefinitionAsync(null, department)).Id);
        Assert.Equal(ReferenceData.DefaultWorkflowName, (await engine.SelectDefinitionAsync(null, otherDepartment)).Name);
    }

    /// <summary>
    /// A one-step route assigned to a whole department of two, used by the completion-policy
    /// tests. Returns the owner's client, the submitted document, and the two assignees.
    /// </summary>
    private async Task<(HttpClient Owner, Guid Document, Guid First, Guid Second)> SingleDepartmentStepAsync(
        StepCompletionPolicy policy)
    {
        var type = await _data.DocumentTypeAsync();
        var department = await _data.DepartmentAsync();
        var first = await _data.UserAsync(ReferenceData.ManagerRole, department);
        var second = await _data.UserAsync(ReferenceData.ManagerRole, department);

        await _data.WorkflowAsync(type, new WorkflowStep
        {
            Name = "Department sign-off",
            AssignmentMode = StepAssignmentMode.Department,
            DepartmentId = department,
            CompletionPolicy = policy,
        });

        var owner = _data.ClientFor(await _data.UserAsync(ReferenceData.RecordOfficerRole, await _data.DepartmentAsync()));
        var document = await owner.CreateAsync(type);

        var submitted = await (await owner.SubmitAsync(document.Id)).ReadAsync<DocumentDetailDto>();
        Assert.Single(submitted.PendingFor(first));
        Assert.Single(submitted.PendingFor(second));

        return (owner, document.Id, first, second);
    }
}
