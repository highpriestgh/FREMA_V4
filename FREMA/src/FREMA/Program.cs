using Duende.Bff;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Features.Admin;
using FREMA.Features.Audit;
using FREMA.Features.Dashboard;
using FREMA.Features.Documents;
using FREMA.Features.Folders;
using FREMA.Features.Navigation;
using FREMA.Features.Roles;
using FREMA.Features.Users;
using FREMA.Features.Workflow;
using FREMA.Identity;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Seeding;
using FREMA.Infrastructure.Storage;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// --- Logging ---------------------------------------------------------------
// The legacy API registered Log4Net and then commented it out, so it shipped with
// no application logging at all.
builder.Host.UseSerilog((context, config) => config
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext());

// --- Configuration ---------------------------------------------------------
// Secrets never live in appsettings.json. Development uses user-secrets, production
// uses environment variables. Every one of these throws at startup when missing,
// rather than failing obscurely on the first request that needs it.
var connectionString = Required("ConnectionStrings:Default");
var origin = Required("Bff:Origin").TrimEnd('/');
var clientSecret = Required("Bff:ClientSecret");

string Required(string key) =>
    builder.Configuration[key]
    ?? throw new InvalidOperationException(
        $"Configuration '{key}' is missing. Set it via user-secrets (development) " +
        "or environment variables (production).");

// --- Persistence -----------------------------------------------------------
builder.Services.AddDbContext<FremaDbContext>(options =>
    options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()));

// --- ASP.NET Identity ------------------------------------------------------
builder.Services
    .AddIdentity<ApplicationUser, ApplicationRole>(options =>
    {
        options.User.RequireUniqueEmail = true;

        // The legacy config set a 12-character minimum but disabled every character
        // class, so "aaaaaaaaaaaa" was a valid password.
        options.Password.RequiredLength = 12;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireDigit = true;
        options.Password.RequireNonAlphanumeric = true;

        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);

        options.SignIn.RequireConfirmedEmail = false;
    })
    .AddEntityFrameworkStores<FremaDbContext>()
    .AddDefaultTokenProviders();

// --- IdentityServer --------------------------------------------------------
// Embedded in this host: the application is an OIDC client of itself.
builder.Services
    .AddIdentityServer(options =>
    {
        options.IssuerUri = origin;
        options.Events.RaiseErrorEvents = true;
        options.Events.RaiseFailureEvents = true;
        options.Events.RaiseInformationEvents = true;
        options.Events.RaiseSuccessEvents = true;

        options.UserInteraction.LoginUrl = "/Account/Login";
        options.UserInteraction.LogoutUrl = "/Account/Logout";
        options.UserInteraction.ErrorUrl = "/Account/Error";

        options.LicenseKey = builder.Configuration["IdentityServer:LicenseKey"];
    })
    .AddInMemoryIdentityResources(IdentityServerConfig.IdentityResources)
    .AddInMemoryApiScopes(IdentityServerConfig.ApiScopes)
    .AddInMemoryApiResources(IdentityServerConfig.ApiResources)
    .AddInMemoryClients(IdentityServerConfig.Clients(origin, clientSecret))
    // Grants and consents survive a restart. Configuration stays in source; see
    // IdentityServerConfig for why.
    .AddOperationalStore(options =>
    {
        options.ConfigureDbContext = db => db.UseSqlServer(connectionString,
            sql => sql.MigrationsAssembly(typeof(Program).Assembly.FullName));
        options.EnableTokenCleanup = true;
        options.RemoveConsumedTokens = true;
    })
    .AddAspNetIdentity<ApplicationUser>();

// --- Authentication --------------------------------------------------------
// Two cookie schemes share this host and must not be confused with one another:
//
//   Identity.Application  the identity-provider session, set by the login page
//   bff                   the SPA's session, set after the OIDC round-trip
//
// AddIdentity above pointed the default schemes at Identity.Application; this
// re-points them at the BFF, because the overwhelming majority of requests are SPA
// API calls. IdentityServer names its cookie scheme explicitly, so it is unaffected.
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultScheme = "bff";
        options.DefaultChallengeScheme = "oidc";
        options.DefaultSignOutScheme = "oidc";

        // Easy to miss, and silently fatal: AddIdentity sets DefaultSignInScheme to
        // Identity.External. Leaving it there makes the OIDC callback deposit the session
        // in Identity's external-login cookie instead of the BFF's, so /bff/login appears
        // to succeed while every API call afterwards is anonymous.
        options.DefaultSignInScheme = "bff";
    })
    .AddCookie("bff", options =>
    {
        options.Cookie.Name = "__Host-frema-bff";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
    })
    .AddOpenIdConnect("oidc", options =>
    {
        options.Authority = origin;
        options.ClientId = IdentityServerConfig.SpaClientId;
        options.ClientSecret = clientSecret;
        options.ResponseType = "code";
        options.ResponseMode = "query";
        options.UsePkce = true;

        // Tokens are kept server-side by the BFF; nothing reaches the browser.
        options.SaveTokens = true;
        options.GetClaimsFromUserInfoEndpoint = true;
        options.MapInboundClaims = false;

        options.Scope.Clear();
        options.Scope.Add("openid");
        options.Scope.Add("profile");
        options.Scope.Add("email");
        options.Scope.Add(IdentityServerConfig.ApiScope);
        options.Scope.Add("offline_access");

        options.TokenValidationParameters.NameClaimType = "name";
        options.TokenValidationParameters.RoleClaimType = "role";
    });

// --- BFF -------------------------------------------------------------------
builder.Services.AddBff(options =>
{
    // Every state-changing call from the SPA must carry this header. A cross-site
    // form post cannot set it, which is what makes the session cookie safe to use.
    options.AntiForgeryHeaderName = "X-CSRF";
    options.AntiForgeryHeaderValue = "1";
    options.LicenseKey = builder.Configuration["IdentityServer:LicenseKey"];
});

// --- Authorization ---------------------------------------------------------
// Scoped, not singleton: the handler depends on the scoped DbContext.
builder.Services.AddScoped<IAuthorizationHandler, DocumentAuthorizationHandler>();
builder.Services.AddSingleton<IClaimsTransformation, PermissionClaimsTransformation>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();

// Endpoints are protected unless they opt out — the inverse of the legacy default,
// where an endpoint was open unless someone remembered to decorate it.
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder("bff")
        .RequireAuthenticatedUser()
        .Build());

// One policy per permission, registered from the canonical list. A typo in a policy
// name then fails at startup instead of silently allowing the request through — which
// is how the legacy "ApiScope" policy behaved: defined, requiring a scope that did not
// exist, and never applied to anything.
foreach (var permission in Permissions.All)
{
    builder.Services.AddAuthorizationBuilder()
        .AddPolicy(permission, policy => policy
            .AddAuthenticationSchemes("bff")
            .RequireAuthenticatedUser()
            .RequireClaim(Permissions.ClaimType, permission));
}

// --- UI & diagnostics ------------------------------------------------------
// --- Application services --------------------------------------------------
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<WorkflowEngine>();

// --- File storage ----------------------------------------------------------
// Validated at startup, so a misconfigured root fails the deployment rather than the
// first upload. Defaults to a sibling of the content root — never inside wwwroot, which
// is how the legacy API ended up serving every document as a browsable static file.
builder.Services
    .AddOptions<StorageOptions>()
    .Bind(builder.Configuration.GetSection(StorageOptions.SectionName))
    .Configure(options =>
    {
        if (string.IsNullOrWhiteSpace(options.RootPath))
        {
            options.RootPath = Path.Combine(builder.Environment.ContentRootPath, "..", "..", "storage");
        }
    })
    .ValidateDataAnnotations()
    .Validate(
        options => !Path.GetFullPath(options.RootPath)
            .StartsWith(Path.GetFullPath(builder.Environment.WebRootPath ?? "wwwroot"), StringComparison.OrdinalIgnoreCase),
        "Storage:RootPath must not be inside the web root — files there would be publicly servable.")
    .ValidateOnStart();

builder.Services.AddSingleton<IDocumentStorage, LocalDiskDocumentStorage>();

builder.Services.AddRazorPages();
builder.Services.AddScoped<DatabaseSeeder>();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DomainExceptionHandler>();
builder.Services.AddHealthChecks()
    .AddDbContextCheck<FremaDbContext>("database");
builder.Services.AddOpenApi();

var app = builder.Build();

// --- Seeding ---------------------------------------------------------------
// An explicit command, not a startup side effect: a deployment restarting a process
// must never silently rewrite reference data.
if (args.Contains("--seed"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
    return;
}

// --- Pipeline --------------------------------------------------------------
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseSerilogRequestLogging();
app.UseStaticFiles();
app.UseRouting();

// UseIdentityServer calls UseAuthentication internally; do not add it again.
app.UseIdentityServer();
app.UseBff();
app.UseAuthorization();

app.MapBffManagementEndpoints();
app.MapRazorPages();
app.MapHealthChecks("/health").AllowAnonymous();

app.MapDocumentEndpoints();
app.MapDocumentContentEndpoints();
app.MapReferenceDataEndpoints();
app.MapUserEndpoints();
app.MapRoleEndpoints();
app.MapFolderEndpoints();
app.MapNavigationEndpoints();
app.MapDashboardEndpoints();
app.MapAuditEndpoints();

// --- SPA ------------------------------------------------------------------
// Anything not matched above is a client-side route, so index.html is returned and React
// Router takes over. Placed last so it can never shadow an API route.
//
// AllowAnonymous because the shell itself is not sensitive: it holds no data, and every
// endpoint it calls is independently authorized. Requiring a session here would mean
// answering an unauthenticated request with a redirect the SPA cannot follow.
app.MapFallbackToFile("index.html").AllowAnonymous();

app.Run();

/// <summary>Exposed so the integration test host can reference the entry point.</summary>
public partial class Program;
