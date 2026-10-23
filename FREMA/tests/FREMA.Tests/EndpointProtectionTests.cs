using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using FREMA.Domain;
using FREMA.Tests.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace FREMA.Tests;

/// <summary>
/// Sweeps every <c>/api</c> endpoint the application maps, so a new endpoint is covered the
/// moment it exists. The legacy API protected endpoints only where someone remembered to; here
/// a forgotten policy fails the build.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed partial class EndpointProtectionTests(FremaFactory factory)
{
    private readonly TestData _data = new(factory);

    private sealed record ApiEndpoint(
        string Method,
        string Pattern,
        IReadOnlyList<IAuthorizeData> Authorization,
        bool Anonymous,
        bool AcceptsFiles)
    {
        public override string ToString() => $"{Method} {Pattern}";

        /// <summary>The permission policy the endpoint requires, if any.</summary>
        public string? Permission =>
            Authorization.Select(a => a.Policy).FirstOrDefault(p => p is not null && Permissions.All.Contains(p));
    }

    private IReadOnlyList<ApiEndpoint> ApiEndpoints() =>
        factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Select(e => (Endpoint: e, Pattern: "/" + e.RoutePattern.RawText?.TrimStart('/')))
            .Where(e => e.Pattern.StartsWith("/api/", StringComparison.Ordinal))
            .SelectMany(e => (e.Endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? [])
                .Select(method => new ApiEndpoint(
                    method,
                    e.Pattern,
                    e.Endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>(),
                    e.Endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null,
                    e.Endpoint.Metadata.GetMetadata<IAcceptsMetadata>()?.ContentTypes
                        .Contains("multipart/form-data") ?? false)))
            .ToList();

    [Fact]
    public void Every_api_endpoint_declares_its_authorization()
    {
        var endpoints = ApiEndpoints();
        Assert.True(endpoints.Count > 40, $"Expected the full API, found only {endpoints.Count} endpoints.");

        // Relying on the fallback policy would work, but an explicit RequireAuthorization says
        // the author thought about who may call it.
        var undeclared = endpoints.Where(e => e.Authorization.Count == 0 && !e.Anonymous).ToList();
        Assert.True(undeclared.Count == 0, "No authorization declared on: " + string.Join(", ", undeclared));

        var anonymous = endpoints.Where(e => e.Anonymous).ToList();
        Assert.True(anonymous.Count == 0, "Anonymous API endpoints: " + string.Join(", ", anonymous));
    }

    [Fact]
    public async Task Every_api_endpoint_refuses_an_anonymous_caller()
    {
        var client = _data.Anonymous();
        var failures = new List<string>();

        foreach (var endpoint in ApiEndpoints())
        {
            var status = await SendAsync(client, endpoint);
            if (status != HttpStatusCode.Unauthorized)
            {
                failures.Add($"{endpoint} → {(int)status}");
            }
        }

        Assert.True(failures.Count == 0, "Reachable without signing in: " + string.Join(", ", failures));
    }

    [Fact]
    public async Task Every_permission_protected_endpoint_refuses_a_user_without_that_permission()
    {
        // Signed in, in a department, but holding no role and therefore no permissions.
        var userId = await _data.UserAsync(role: null, await _data.DepartmentAsync());
        var client = _data.ClientFor(userId);

        var guarded = ApiEndpoints().Where(e => e.Permission is not null).ToList();
        Assert.True(guarded.Count > 30, $"Expected most endpoints to need a permission, found {guarded.Count}.");

        var failures = new List<string>();
        foreach (var endpoint in guarded)
        {
            var status = await SendAsync(client, endpoint);
            if (status != HttpStatusCode.Forbidden)
            {
                failures.Add($"{endpoint} (needs {endpoint.Permission}) → {(int)status}");
            }
        }

        Assert.True(failures.Count == 0, "Reachable without the permission: " + string.Join(", ", failures));
    }

    [Fact]
    public async Task A_state_changing_call_without_the_antiforgery_header_is_rejected()
    {
        var userId = await _data.UserAsync(role: null, await _data.DepartmentAsync());
        var client = _data.ClientFor(userId);
        client.DefaultRequestHeaders.Remove("X-CSRF");

        var post = await client.PostAsync("/api/notifications/read-all", null);
        Assert.Equal(HttpStatusCode.BadRequest, post.StatusCode);

        // Reads are exempt, so plain links (open a PDF in a new tab) keep working.
        var get = await client.GetAsync("/api/users/me");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
    }

    /// <summary>
    /// Calls an endpoint with placeholder route values and, for writes, an empty body of the
    /// type it accepts. The type matters: routing refuses a mismatched one with 415 before
    /// authorization runs, which would hide what this test is looking for.
    /// </summary>
    private static async Task<HttpStatusCode> SendAsync(HttpClient client, ApiEndpoint endpoint)
    {
        var path = RouteParameter().Replace(endpoint.Pattern, Guid.NewGuid().ToString());
        using var request = new HttpRequestMessage(new HttpMethod(endpoint.Method), path);

        if (endpoint.AcceptsFiles)
        {
            request.Content = new MultipartFormDataContent
            {
                { new ByteArrayContent("%PDF-1.4"u8.ToArray()), "file", "probe.pdf" },
            };
        }
        else if (endpoint.Method is "POST" or "PUT" or "PATCH")
        {
            request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
        }

        using var response = await client.SendAsync(request);
        return response.StatusCode;
    }

    [GeneratedRegex(@"\{[^}]+\}")]
    private static partial Regex RouteParameter();
}
