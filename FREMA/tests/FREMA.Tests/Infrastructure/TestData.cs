using System.Net.Http.Json;
using FREMA.Domain;
using FREMA.Features.Documents;
using FREMA.Features.Workflow;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace FREMA.Tests.Infrastructure;

/// <summary>
/// Builds what a test needs, isolated from every other test: each call makes a new department,
/// document type or user with a unique name, so tests sharing the database never see each
/// other's data through a department- or type-scoped rule.
/// </summary>
public sealed class TestData(FremaFactory factory)
{
    public const string Password = "Test-User-Passw0rd!";

    public async Task<Guid> DepartmentAsync() => await WithDbAsync(async db =>
    {
        var department = new Department { Name = $"Dept {Unique()}" };
        db.Departments.Add(department);
        await db.SaveChangesAsync();
        return department.Id;
    });

    public async Task<Guid> DocumentTypeAsync() => await WithDbAsync(async db =>
    {
        var type = new DocumentType { Name = $"Type {Unique()}" };
        db.DocumentTypes.Add(type);
        await db.SaveChangesAsync();
        return type.Id;
    });

    /// <summary>A user in the given department, holding the given role (or none).</summary>
    public async Task<Guid> UserAsync(string? role, Guid departmentId)
    {
        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var email = $"user-{Unique()}@frema.test";
        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FirstName = "Test",
            LastName = role ?? "Nobody",
            DepartmentId = departmentId,
            IsActive = true,
        };

        Check(await users.CreateAsync(user, Password));
        if (role is not null)
        {
            Check(await users.AddToRoleAsync(user, role));
        }

        return user.Id;

        static void Check(IdentityResult result)
        {
            if (!result.Succeeded)
            {
                throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
            }
        }
    }

    /// <summary>
    /// A route scoped to one document type, so only documents of that type use it.
    /// </summary>
    public async Task<Guid> WorkflowAsync(Guid documentTypeId, params WorkflowStep[] steps) => await WithDbAsync(async db =>
    {
        var order = 1;
        foreach (var step in steps)
        {
            step.Order = order++;
        }

        var definition = new WorkflowDefinition
        {
            Name = $"Route {Unique()}",
            DocumentTypeId = documentTypeId,
            Steps = steps,
        };

        db.WorkflowDefinitions.Add(definition);
        await db.SaveChangesAsync();
        return definition.Id;
    });

    public HttpClient ClientFor(Guid userId)
    {
        var client = Anonymous();
        client.DefaultRequestHeaders.Add(TestAuthHandler.UserHeader, userId.ToString());
        return client;
    }

    /// <summary>No user, but the antiforgery header the SPA always sends.</summary>
    public HttpClient Anonymous()
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            BaseAddress = new Uri("https://localhost"),
        });
        client.DefaultRequestHeaders.Add("X-CSRF", "1");
        return client;
    }

    public async Task<T> WithDbAsync<T>(Func<FremaDbContext, Task<T>> work)
    {
        using var scope = factory.Services.CreateScope();
        return await work(scope.ServiceProvider.GetRequiredService<FremaDbContext>());
    }

    private static string Unique() => Guid.NewGuid().ToString("N")[..10];
}

/// <summary>The document calls a test makes, over HTTP, as a given user.</summary>
public static class DocumentApi
{
    public static async Task<DocumentDetailDto> CreateAsync(this HttpClient client, Guid? documentTypeId = null)
    {
        var response = await client.PostAsJsonAsync("/api/documents",
            new CreateDocumentRequest($"Test document {Guid.NewGuid():N}", null, null, documentTypeId, null, null));
        return await response.ReadAsync<DocumentDetailDto>();
    }

    public static Task<HttpResponseMessage> SubmitAsync(this HttpClient client, Guid documentId, params Guid[] assignees) =>
        client.PostAsJsonAsync($"/api/documents/{documentId}/submit",
            new SubmitDocumentRequest(assignees.Length == 0 ? null : assignees, null));

    public static Task<HttpResponseMessage> DecideAsync(
        this HttpClient client,
        Guid documentId,
        WorkflowDecision decision,
        string? comment = null,
        params Guid[] nextAssignees) =>
        client.PostAsJsonAsync($"/api/documents/{documentId}/decision",
            new DecisionRequest(decision, comment, nextAssignees.Length == 0 ? null : nextAssignees));

    public static Task<HttpResponseMessage> GetAsync(this HttpClient client, Guid documentId) =>
        client.GetAsync($"/api/documents/{documentId}");

    public static async Task<DocumentDetailDto> GetDocumentAsync(this HttpClient client, Guid documentId) =>
        await (await client.GetAsync(documentId)).ReadAsync<DocumentDetailDto>();

    /// <summary>Reads a successful response, or fails with the server's own error text.</summary>
    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"{(int)response.StatusCode} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        }

        return (await response.Content.ReadFromJsonAsync<T>())!;
    }
}

public static class Routings
{
    public static IEnumerable<RoutingDto> PendingFor(this DocumentDetailDto document, Guid userId) =>
        document.Routings.Where(r => r.AssignedToId == userId && r.Status == RoutingStatus.Pending);

    public static Task<List<WorkflowRouting>> ForDocumentAsync(this TestData data, Guid documentId) =>
        data.WithDbAsync(db => db.WorkflowRoutings.AsNoTracking()
            .Where(r => r.DocumentId == documentId)
            .OrderBy(r => r.RoutedAt)
            .ToListAsync());
}
