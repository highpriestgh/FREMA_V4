using FREMA.Infrastructure.Persistence;
using FREMA.Infrastructure.Reminders;
using FREMA.Infrastructure.Seeding;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FREMA.Tests.Infrastructure;

/// <summary>
/// The real application, in memory, on a throwaway SQL Server database.
/// <para>
/// One database per test run: created and seeded on start, dropped on dispose. The server comes
/// from <c>FREMA_TEST_SQL</c> (a connection string without a database; CI sets it to a SQL
/// Server container), defaulting to LocalDB on a developer's machine. SQL Server rather than an
/// in-memory provider, because the code under test relies on it: transactions, raw SQL in the
/// number generator, <c>ExecuteUpdate</c>, filtered unique indexes.
/// </para>
/// <para>
/// Everything is the production pipeline except who is signed in: <see cref="TestAuthHandler"/>
/// replaces the cookie, so a test can act as any user. Permissions are still expanded from the
/// database by the real claims transformation, and every policy and resource check is real.
/// </para>
/// </summary>
public sealed class FremaFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly string _storageRoot =
        Path.Combine(Path.GetTempPath(), "frema-tests", Guid.NewGuid().ToString("N"));

    public FremaFactory()
    {
        var server = Environment.GetEnvironmentVariable("FREMA_TEST_SQL")
                     ?? @"Server=(localdb)\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True";

        ConnectionString = new SqlConnectionStringBuilder(server)
        {
            InitialCatalog = $"FREMA_Test_{Guid.NewGuid():N}",
            MultipleActiveResultSets = true,
        }.ConnectionString;
    }

    public string ConnectionString { get; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Not Development: that would load the developer's user-secrets, including their own
        // connection string, and the tests must never touch a real database.
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("Storage:RootPath", _storageRoot);
        builder.UseSetting("Seed:AdminPassword", "Test-Admin-Passw0rd!");
        builder.UseSetting("Serilog:MinimumLevel:Default",
            Environment.GetEnvironmentVariable("FREMA_TEST_LOG_LEVEL") ?? "Warning");

        builder.ConfigureTestServices(services =>
        {
            services.AddAuthentication()
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, null);

            // AddIdentity points the defaults at its cookie; point them here instead.
            services.PostConfigure<AuthenticationOptions>(options =>
            {
                options.DefaultScheme = TestAuthHandler.SchemeName;
                options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                options.DefaultForbidScheme = TestAuthHandler.SchemeName;
            });

            // The reminder loop would write notifications on its own schedule mid-test.
            var reminders = services
                .Where(d => d.ServiceType == typeof(IHostedService)
                            && d.ImplementationType == typeof(ReminderHostedService))
                .ToList();
            foreach (var descriptor in reminders)
            {
                services.Remove(descriptor);
            }
        });
    }

    public async Task InitializeAsync()
    {
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        using (var scope = Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<FremaDbContext>().Database.EnsureDeletedAsync();
        }

        await base.DisposeAsync();

        if (Directory.Exists(_storageRoot))
        {
            Directory.Delete(_storageRoot, recursive: true);
        }
    }
}

/// <summary>Every test class shares one application and database, and runs one at a time.</summary>
[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<FremaFactory>
{
    public const string Name = "api";
}
