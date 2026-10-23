using System.Net;
using System.Net.Http.Json;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Features.Documents;
using FREMA.Infrastructure.Seeding;
using FREMA.Tests.Infrastructure;

namespace FREMA.Tests;

/// <summary>
/// Who may see and change a document (rebuild plan §1.3): its uploader, anyone in its routing
/// chain, or a holder of <c>documents.view.all</c>. Holding <c>documents.view</c> alone grants
/// nothing about any particular document; the legacy API let any signed-in user read anything.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class VisibilityTests(FremaFactory factory)
{
    private readonly TestData _data = new(factory);

    [Fact]
    public async Task A_document_is_visible_to_its_owner_its_routing_chain_and_view_all_holders_only()
    {
        var ownerId = await _data.UserAsync(ReferenceData.RecordOfficerRole, await _data.DepartmentAsync());
        var outsiderId = await _data.UserAsync(ReferenceData.ViewerRole, await _data.DepartmentAsync());
        var recipientId = await _data.UserAsync(ReferenceData.ViewerRole, await _data.DepartmentAsync());
        var managerId = await _data.UserAsync(ReferenceData.ManagerRole, await _data.DepartmentAsync());

        var owner = _data.ClientFor(ownerId);
        var outsider = _data.ClientFor(outsiderId);
        var recipient = _data.ClientFor(recipientId);
        var manager = _data.ClientFor(managerId);

        var document = await owner.CreateAsync();

        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync(document.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync(document.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await recipient.GetAsync(document.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await manager.GetAsync(document.Id)).StatusCode);
        Assert.False(await ListContainsAsync(outsider, document.Id));

        // Routing it to someone brings them into the chain.
        await (await owner.SubmitAsync(document.Id, recipientId)).ReadAsync<DocumentDetailDto>();

        Assert.Equal(HttpStatusCode.OK, (await recipient.GetAsync(document.Id)).StatusCode);
        Assert.True(await ListContainsAsync(recipient, document.Id));
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync(document.Id)).StatusCode);
        Assert.False(await ListContainsAsync(outsider, document.Id));
        Assert.True(await ListContainsAsync(manager, document.Id));
    }

    [Fact]
    public async Task Only_the_owner_edits_and_only_while_the_document_is_with_them()
    {
        var ownerId = await _data.UserAsync(ReferenceData.RecordOfficerRole, await _data.DepartmentAsync());
        var colleagueId = await _data.UserAsync(ReferenceData.EditorRole, await _data.DepartmentAsync());
        var reviewerId = await _data.UserAsync(ReferenceData.ManagerRole, await _data.DepartmentAsync());
        var owner = _data.ClientFor(ownerId);
        var colleague = _data.ClientFor(colleagueId);

        var document = await owner.CreateAsync();
        var edit = new UpdateDocumentRequest("Edited", null, null, null, null);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await colleague.PutAsJsonAsync($"/api/documents/{document.Id}", edit)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await owner.PutAsJsonAsync($"/api/documents/{document.Id}", edit)).StatusCode);

        await (await owner.SubmitAsync(document.Id, reviewerId)).ReadAsync<DocumentDetailDto>();

        // In a workflow the content is locked, even for its owner.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await owner.PutAsJsonAsync($"/api/documents/{document.Id}", edit)).StatusCode);
    }

    [Fact]
    public async Task Only_an_unsubmitted_draft_can_be_deleted_by_its_owner()
    {
        var ownerId = await _data.UserAsync(ReferenceData.RecordOfficerRole, await _data.DepartmentAsync());
        var outsiderId = await _data.UserAsync(ReferenceData.ViewerRole, await _data.DepartmentAsync());
        var reviewerId = await _data.UserAsync(ReferenceData.ManagerRole, await _data.DepartmentAsync());
        var owner = _data.ClientFor(ownerId);

        var draft = await owner.CreateAsync();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await _data.ClientFor(outsiderId).DeleteAsync($"/api/documents/{draft.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/documents/{draft.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(draft.Id)).StatusCode);

        var submitted = await owner.CreateAsync();
        await (await owner.SubmitAsync(submitted.Id, reviewerId)).ReadAsync<DocumentDetailDto>();

        // Once in a workflow it is part of the record.
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.DeleteAsync($"/api/documents/{submitted.Id}")).StatusCode);
    }

    private static async Task<bool> ListContainsAsync(HttpClient client, Guid documentId)
    {
        var page = await (await client.GetAsync("/api/documents?pageSize=100"))
            .ReadAsync<PagedResult<DocumentSummaryDto>>();
        return page.Items.Any(d => d.Id == documentId);
    }
}
