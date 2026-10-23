using System.Security.Cryptography;
using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Infrastructure.Seeding;

/// <summary>
/// Brings a database up to the reference state. Idempotent: every step reconciles what is
/// there against <see cref="ReferenceData"/>, so re-running adds what is missing and
/// changes nothing else.
/// <para>
/// Invoked explicitly with <c>dotnet run -- --seed</c>, never automatically at startup —
/// seeding is an administrative act and should not be a side effect of a deployment
/// restarting a process.
/// </para>
/// </summary>
public sealed class DatabaseSeeder(
    FremaDbContext db,
    UserManager<ApplicationUser> userManager,
    RoleManager<ApplicationRole> roleManager,
    IConfiguration configuration,
    ILogger<DatabaseSeeder> logger)
{
    public async Task SeedAsync(CancellationToken ct = default)
    {
        logger.LogInformation("Applying pending migrations");
        await db.Database.MigrateAsync(ct);

        await SeedPermissionsAsync(ct);
        await SeedRolesAsync(ct);
        await SeedDepartmentsAsync(ct);
        await SeedDocumentTypesAsync(ct);
        await SeedOriginsAsync(ct);
        await SeedMenuAsync(ct);
        await SeedDefaultWorkflowAsync(ct);
        await SeedAdministratorAsync(ct);

        logger.LogInformation("Seeding complete");
    }

    private async Task SeedPermissionsAsync(CancellationToken ct)
    {
        var existing = await db.Permissions.Select(p => p.Name).ToListAsync(ct);
        var missing = ReferenceData.PermissionCatalogue
            .Where(entry => !existing.Contains(entry.Key))
            .Select(entry => new Permission
            {
                Name = entry.Key,
                DisplayName = entry.Value.Display,
                Category = entry.Value.Category,
            })
            .ToList();

        if (missing.Count == 0)
        {
            return;
        }

        db.Permissions.AddRange(missing);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Added {Count} permissions", missing.Count);
    }

    private async Task SeedRolesAsync(CancellationToken ct)
    {
        var permissionsByName = await db.Permissions.ToDictionaryAsync(p => p.Name, ct);

        foreach (var seed in ReferenceData.Roles)
        {
            var role = await roleManager.FindByNameAsync(seed.Name);

            if (role is null)
            {
                role = new ApplicationRole
                {
                    Name = seed.Name,
                    Description = seed.Description,
                    IsSystemRole = true,
                };

                var created = await roleManager.CreateAsync(role);
                if (!created.Succeeded)
                {
                    throw new InvalidOperationException(
                        $"Could not create role '{seed.Name}': " +
                        string.Join("; ", created.Errors.Select(e => e.Description)));
                }

                logger.LogInformation("Created role {Role}", seed.Name);
            }

            // Reconcile grants rather than replacing them, so a permission added to a role
            // in a later release lands without disturbing local customisation.
            var granted = await db.RolePermissions
                .Where(rp => rp.RoleId == role.Id)
                .Select(rp => rp.PermissionId)
                .ToListAsync(ct);

            var toGrant = seed.Permissions
                .Select(name => permissionsByName[name].Id)
                .Except(granted)
                .Select(permissionId => new RolePermission
                {
                    RoleId = role.Id,
                    PermissionId = permissionId,
                })
                .ToList();

            if (toGrant.Count > 0)
            {
                db.RolePermissions.AddRange(toGrant);
                await db.SaveChangesAsync(ct);
                logger.LogInformation("Granted {Count} permissions to {Role}", toGrant.Count, seed.Name);
            }
        }
    }

    private async Task SeedDepartmentsAsync(CancellationToken ct)
    {
        var existing = await db.Departments.Select(d => d.Name).ToListAsync(ct);
        var missing = ReferenceData.Departments
            .Where(name => !existing.Contains(name))
            .Select(name => new Department { Name = name })
            .ToList();

        if (missing.Count == 0)
        {
            return;
        }

        db.Departments.AddRange(missing);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Added {Count} departments", missing.Count);
    }

    private async Task SeedDocumentTypesAsync(CancellationToken ct)
    {
        var existing = await db.DocumentTypes.Select(t => t.Name).ToListAsync(ct);
        var missing = ReferenceData.DocumentTypes
            .Where(t => !existing.Contains(t.Name))
            .Select(t => new DocumentType { Name = t.Name, Description = t.Description })
            .ToList();

        if (missing.Count == 0)
        {
            return;
        }

        db.DocumentTypes.AddRange(missing);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Added {Count} document types", missing.Count);
    }

    private async Task SeedOriginsAsync(CancellationToken ct)
    {
        var existing = await db.Origins.Select(o => o.Name).ToListAsync(ct);
        var missing = ReferenceData.Origins
            .Where(o => !existing.Contains(o.Name))
            .Select(o => new Origin { Name = o.Name, Description = o.Description })
            .ToList();

        if (missing.Count == 0)
        {
            return;
        }

        db.Origins.AddRange(missing);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Added {Count} origins", missing.Count);
    }

    private async Task SeedMenuAsync(CancellationToken ct)
    {
        if (await db.MenuItems.AnyAsync(ct))
        {
            return;
        }

        var permissionsByName = await db.Permissions.ToDictionaryAsync(p => p.Name, ct);

        foreach (var seed in ReferenceData.Menu)
        {
            var parent = ToMenuItem(seed, permissionsByName, parentId: null);
            db.MenuItems.Add(parent);

            foreach (var child in seed.Children ?? [])
            {
                db.MenuItems.Add(ToMenuItem(child, permissionsByName, parent.Id));
            }
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded navigation menu");
    }

    private static MenuItem ToMenuItem(
        ReferenceData.MenuSeed seed,
        IReadOnlyDictionary<string, Permission> permissions,
        Guid? parentId) => new()
        {
            Id = Guid.NewGuid(),
            Label = seed.Label,
            Path = seed.Path,
            Icon = seed.Icon,
            SortOrder = seed.SortOrder,
            ParentId = parentId,
            RequiredPermissionId = seed.RequiredPermission is null
                ? null
                : permissions[seed.RequiredPermission].Id,
        };

    /// <summary>
    /// A two-step fallback route. Both steps choose their assignee when the document is
    /// routed, which is how the legacy system behaved for every hop — the difference is that
    /// this is now one configurable option among four, not the only possibility.
    /// </summary>
    private async Task SeedDefaultWorkflowAsync(CancellationToken ct)
    {
        if (await db.WorkflowDefinitions.AnyAsync(w => w.IsDefault, ct))
        {
            return;
        }

        var definition = new WorkflowDefinition
        {
            Name = ReferenceData.DefaultWorkflowName,
            Description = "Applies to any document without a more specific route.",
            IsDefault = true,
            IsActive = true,
            Steps =
            [
                new WorkflowStep
                {
                    Order = 1,
                    Name = "Review",
                    Instructions = "Check the document is complete and correctly registered.",
                    AssignmentMode = StepAssignmentMode.ChosenAtRuntime,
                    CompletionPolicy = StepCompletionPolicy.AnyOne,
                    DueAfterDays = 3,
                },
                new WorkflowStep
                {
                    Order = 2,
                    Name = "Approval",
                    Instructions = "Approve, or return to the sender with a reason.",
                    AssignmentMode = StepAssignmentMode.ChosenAtRuntime,
                    CompletionPolicy = StepCompletionPolicy.AnyOne,
                    DueAfterDays = 5,
                },
            ],
        };

        db.WorkflowDefinitions.Add(definition);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded default workflow '{Name}'", definition.Name);
    }

    private async Task SeedAdministratorAsync(CancellationToken ct)
    {
        var email = configuration["Seed:AdminEmail"] ?? "admin@frema.local";

        // Every workflow assignment is filed under a department, so a user without one
        // cannot participate. The administrator is placed in the executive office.
        var department = await db.Departments
            .Where(d => d.Name == "Executive Office")
            .Select(d => (Guid?)d.Id)
            .FirstOrDefaultAsync(ct);

        if (await userManager.FindByEmailAsync(email) is { } existing)
        {
            if (existing.DepartmentId is null && department is not null)
            {
                existing.DepartmentId = department;
                await userManager.UpdateAsync(existing);
                logger.LogInformation("Assigned administrator {Email} to Executive Office", email);
            }
            else
            {
                logger.LogInformation("Administrator {Email} already exists", email);
            }

            return;
        }

        // A configured password is used as-is; otherwise one is generated and printed once.
        // Nothing weak is ever defaulted to, and no password is committed anywhere — the
        // legacy system generated 12 uppercase hex characters and sent them by SMS
        // alongside the username.
        var configured = configuration["Seed:AdminPassword"];
        var password = configured ?? GeneratePassword();

        var admin = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FirstName = "System",
            LastName = "Administrator",
            IsActive = true,
            MustChangePassword = true,
            DepartmentId = department,
        };

        var created = await userManager.CreateAsync(admin, password);
        if (!created.Succeeded)
        {
            throw new InvalidOperationException(
                "Could not create the administrator: " +
                string.Join("; ", created.Errors.Select(e => e.Description)));
        }

        await userManager.AddToRoleAsync(admin, ReferenceData.AdministratorRole);

        if (configured is null)
        {
            logger.LogWarning(
                "Created administrator {Email} with a generated password: {Password}\n" +
                "This is shown once and is not stored anywhere. Sign in and change it.",
                email, password);
        }
        else
        {
            logger.LogInformation("Created administrator {Email} with the configured password", email);
        }
    }

    /// <summary>
    /// Recovery for a lost administrator password: <c>dotnet run -- --reset-admin-password</c>.
    /// <para>
    /// Sets a new temporary password — <c>Seed:AdminPassword</c> if configured, otherwise a
    /// generated one printed once — and requires it to be changed at the next sign-in. Also
    /// clears any lockout and reactivates the account, since an administrator who cannot get
    /// in is the situation this exists for. Touches that one account and nothing else.
    /// </para>
    /// </summary>
    public async Task ResetAdministratorPasswordAsync(CancellationToken ct = default)
    {
        var email = configuration["Seed:AdminEmail"] ?? "admin@frema.local";

        if (await userManager.FindByEmailAsync(email) is not { } admin)
        {
            logger.LogError("No administrator {Email} exists. Run with --seed to create one.", email);
            return;
        }

        var configured = configuration["Seed:AdminPassword"];
        var password = configured ?? GeneratePassword();

        // A reset token rather than RemovePassword + AddPassword: one call, every password
        // validator still runs, and the security stamp rotates so existing sessions end.
        var token = await userManager.GeneratePasswordResetTokenAsync(admin);
        var result = await userManager.ResetPasswordAsync(admin, token, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                "Could not reset the administrator password: " +
                string.Join("; ", result.Errors.Select(e => e.Description)));
        }

        admin.MustChangePassword = true;
        admin.IsActive = true;
        await userManager.UpdateAsync(admin);
        await userManager.SetLockoutEndDateAsync(admin, null);
        await userManager.ResetAccessFailedCountAsync(admin);

        db.AuditLogs.Add(new AuditLog
        {
            Action = "user.password.reset",
            EntityType = AuditEntityType.User,
            EntityId = admin.Id,
            UserName = Environment.UserName,
            Details = """{"reason":"administrator password reset from the command line"}""",
        });
        await db.SaveChangesAsync(ct);

        if (configured is null)
        {
            logger.LogWarning(
                "Reset administrator {Email} to a generated temporary password: {Password}\n" +
                "This is shown once and is not stored anywhere. Sign in and change it.",
                email, password);
        }
        else
        {
            logger.LogInformation("Reset administrator {Email} to the configured password", email);
        }
    }

    /// <summary>
    /// A 24-character password from a 70-character alphabet, drawn without modulo bias.
    /// The legacy <c>GenerateCode</c> used <c>b % 36</c> over 256 byte values, which skewed
    /// the distribution toward the first twenty-odd characters of its alphabet.
    /// </summary>
    private static string GeneratePassword()
    {
        const string alphabet =
            "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";

        return RandomNumberGenerator.GetString(alphabet, 24);
    }
}
