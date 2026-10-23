using System.Threading.RateLimiting;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Features.Account;
using FREMA.Features.Admin;
using FREMA.Features.Audit;
using FREMA.Features.Dashboard;
using FREMA.Features.Documents;
using FREMA.Features.Folders;
using FREMA.Features.Navigation;
using FREMA.Features.Reports;
using FREMA.Features.Settings;
using FREMA.Features.Roles;
using FREMA.Features.Users;
using FREMA.Features.Workflow;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Reminders;
using FREMA.Infrastructure.Seeding;
using FREMA.Infrastructure.Settings;
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
    .AddSignInManager<FremaSignInManager>()
    .AddDefaultTokenProviders();

// How often a session cookie is re-checked against the database: a changed password or a
// deactivated account (FremaSignInManager) ends the session within this window. Identity's
// default is 30 minutes; one lookup per user per minute is cheap.
builder.Services.Configure<SecurityStampValidatorOptions>(options =>
    options.ValidationInterval = TimeSpan.FromMinutes(1));

// --- Authentication --------------------------------------------------------
// The session is ASP.NET Identity's own application cookie, set by the sign-in page. The SPA
// and the API share one origin, so there is no token server and no OIDC round-trip: the
// cookie is HttpOnly, and state-changing calls also need the X-CSRF header (see
// AntiforgeryHeader). This replaced an embedded Duende IdentityServer + BFF, which needed a
// paid licence in production and gave nothing a single-origin app uses.
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "__Host-frema";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = true;

    options.LoginPath = "/Account/Login";
    options.AccessDeniedPath = "/Account/Login";

    // The SPA's fetch calls cannot follow a redirect to an HTML sign-in page; they need the
    // status code. Only page requests are redirected.
    options.Events.OnRedirectToLogin = context => ApiAwareRedirect(context, StatusCodes.Status401Unauthorized);
    options.Events.OnRedirectToAccessDenied = context => ApiAwareRedirect(context, StatusCodes.Status403Forbidden);
});

// --- Rate limiting ---------------------------------------------------------
// Account lockout (5 wrong passwords → 15 minutes) stops guessing one account's password. This
// stops one source trying many accounts. Only the password-posting forms are limited, per IP
// address. The default is deliberately generous, because an office behind one public address
// shares a single bucket. Behind a reverse proxy, configure forwarded headers first, or every
// request appears to come from the proxy.
var signInAttemptsPerMinute = builder.Configuration.GetValue("Security:SignInAttemptsPerMinute", 30);

builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        HttpMethods.IsPost(context.Request.Method)
        && (context.Request.Path.StartsWithSegments("/Account/Login")
            || context.Request.Path.StartsWithSegments("/Account/ChangePassword"))
            ? RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = signInAttemptsPerMinute,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                })
            : RateLimitPartition.GetNoLimiter("unlimited"));

    // Back to the same page with a readable message, rather than a bare 429 error page. The
    // form posts to its own URL, so the query string still carries the return URL.
    options.OnRejected = (context, _) =>
    {
        var request = context.HttpContext.Request;
        context.HttpContext.RequestServices.GetRequiredService<ILogger<Program>>()
            .LogWarning("Sign-in rate limit reached for {IpAddress}", context.HttpContext.Connection.RemoteIpAddress);

        var query = QueryString.FromUriComponent(request.QueryString.Value ?? "").Add("throttled", "true");
        context.HttpContext.Response.Redirect($"{request.PathBase}{request.Path}{query}");
        return ValueTask.CompletedTask;
    };
});

static Task ApiAwareRedirect(RedirectContext<CookieAuthenticationOptions> context, int apiStatus)
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = apiStatus;
    }
    else
    {
        context.Response.Redirect(context.RedirectUri);
    }
    return Task.CompletedTask;
}

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
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
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
            .RequireAuthenticatedUser()
            .RequireClaim(Permissions.ClaimType, permission));
}

// --- UI & diagnostics ------------------------------------------------------
// --- Application services --------------------------------------------------
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<WorkflowEngine>();
builder.Services.AddSingleton<ISettingsService, SettingsService>();
builder.Services.AddScoped<DocumentNumberGenerator>();
builder.Services.AddScoped<ReminderJob>();
builder.Services.AddHostedService<ReminderHostedService>();

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

// The web server rejects request bodies over ~28 MB by default, before the application sees
// them — an upload the Settings page allows would fail with a bare 413. Both limits are raised
// to the configured ceiling (plus room for multipart framing); the working limit an
// administrator chooses is then enforced by the storage layer with a readable message.
var uploadCeiling = builder.Configuration.GetValue<long?>("Storage:MaxFileSizeBytes") ?? 200L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = uploadCeiling + 1024 * 1024);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(form =>
    form.MultipartBodyLengthLimit = uploadCeiling + 1024 * 1024);

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

if (args.Contains("--reset-admin-password"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().ResetAdministratorPasswordAsync();
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
app.UseRateLimiter();

app.UseAuthentication();
app.UseAntiforgeryHeader();
app.UseAuthorization();

app.MapRazorPages();
app.MapAccountEndpoints();
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
app.MapWorkflowDefinitionEndpoints();
app.MapReportEndpoints();
app.MapSettingsEndpoints();

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
