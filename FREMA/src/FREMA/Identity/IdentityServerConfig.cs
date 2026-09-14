using Duende.IdentityServer;
using Duende.IdentityServer.Models;

namespace FREMA.Identity;

/// <summary>
/// IdentityServer configuration.
/// <para>
/// Held in source rather than in a configuration database. The legacy solution had
/// <em>both</em> — in-memory clients in <c>Config.cs</c> and ConfigurationDb migrations —
/// with no way to tell which was authoritative. There is exactly one client here, so
/// source control gives better reviewability than a database row. Grants and sessions
/// still need durable storage; those go to the operational store.
/// </para>
/// </summary>
public static class IdentityServerConfig
{
    /// <summary>Scope for the application's own API, replacing the legacy <c>fremaapi</c>.</summary>
    public const string ApiScope = "frema.api";

    public const string SpaClientId = "frema.spa";

    public static IEnumerable<IdentityResource> IdentityResources =>
    [
        new IdentityResources.OpenId(),
        new IdentityResources.Profile(),
        new IdentityResources.Email(),
    ];

    public static IEnumerable<ApiScope> ApiScopes =>
    [
        new ApiScope(ApiScope, "FREMA API"),
    ];

    public static IEnumerable<ApiResource> ApiResources =>
    [
        new ApiResource("frema", "FREMA") { Scopes = { ApiScope } },
    ];

    /// <summary>
    /// The single client: this application's own BFF.
    /// </summary>
    /// <param name="origin">Public origin of the app, e.g. <c>https://localhost:5001</c>.</param>
    /// <param name="clientSecret">
    /// From configuration — never hard-coded. The legacy solution embedded the literal
    /// <c>*C&amp;%$#F$%R*&amp;^$</c> in <c>Config.cs</c>, in the API's appsettings, and in the
    /// UI's appsettings, all committed.
    /// </param>
    public static IEnumerable<Client> Clients(string origin, string clientSecret) =>
    [
        new Client
        {
            ClientId = SpaClientId,
            ClientName = "FREMA",

            // A BFF is a confidential client: the secret lives on the server, never in the
            // browser. The legacy code client set RequireClientSecret = false.
            RequireClientSecret = true,
            ClientSecrets = { new Secret(clientSecret.Sha256()) },

            AllowedGrantTypes = GrantTypes.Code,
            RequirePkce = true,
            RequireConsent = false,
            AllowRememberConsent = false,

            // Tokens are held server-side by the BFF and never reach JavaScript.
            AllowAccessTokensViaBrowser = false,
            AllowOfflineAccess = true,

            RedirectUris = { $"{origin}/signin-oidc" },
            PostLogoutRedirectUris = { $"{origin}/signout-callback-oidc" },
            BackChannelLogoutUri = $"{origin}/bff/backchannel",

            AllowedScopes =
            {
                IdentityServerConstants.StandardScopes.OpenId,
                IdentityServerConstants.StandardScopes.Profile,
                IdentityServerConstants.StandardScopes.Email,
                ApiScope,
            },

            // Keep the identity token small; the BFF calls the userinfo endpoint instead.
            AlwaysIncludeUserClaimsInIdToken = false,

            AccessTokenLifetime = (int)TimeSpan.FromMinutes(15).TotalSeconds,
            RefreshTokenUsage = TokenUsage.OneTimeOnly,
            RefreshTokenExpiration = TokenExpiration.Sliding,
            SlidingRefreshTokenLifetime = (int)TimeSpan.FromDays(15).TotalSeconds,

            CoordinateLifetimeWithUserSession = true,
        },
    ];
}
