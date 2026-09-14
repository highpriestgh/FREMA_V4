using Duende.Bff;
using FREMA.Domain;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Navigation;

public sealed record MenuItemDto(
    Guid Id,
    string Label,
    string Path,
    string? Icon,
    IReadOnlyList<MenuItemDto> Children);

public static class NavigationEndpoints
{
    public static IEndpointRouteBuilder MapNavigationEndpoints(this IEndpointRouteBuilder app)
    {
        var menu = app.MapGet("/api/menu", GetMenuAsync)
            .WithTags("Navigation")
            .RequireAuthorization();
        menu.AsBffApiEndpoint();

        return app;
    }

    /// <summary>Flattened menu row, before the tree is assembled.</summary>
    private sealed record Row(
        Guid Id,
        string Label,
        string Path,
        string? Icon,
        Guid? ParentId,
        string? RequiredPermission);

    /// <summary>
    /// The navigation tree, filtered to what this user may actually reach.
    /// <para>
    /// This decides what is <em>drawn</em>, nothing more. In the legacy system the menu
    /// tables were the only access control there was — hiding a link was the whole of the
    /// security model, and calling the endpoint behind it directly worked fine. Here the
    /// same permission that reveals an item also guards its endpoints, independently.
    /// </para>
    /// </summary>
    private static async Task<Ok<IReadOnlyList<MenuItemDto>>> GetMenuAsync(
        FremaDbContext db,
        HttpContext http,
        CancellationToken ct)
    {
        var rows = await db.MenuItems
            .AsNoTracking()
            .Where(m => m.IsActive)
            .OrderBy(m => m.SortOrder)
            .Select(m => new Row(
                m.Id, m.Label, m.Path, m.Icon, m.ParentId, m.RequiredPermission!.Name))
            .ToListAsync(ct);

        var granted = http.User
            .FindAll(Permissions.ClaimType)
            .Select(c => c.Value)
            .ToHashSet();

        var visible = rows
            .Where(m => m.RequiredPermission is null || granted.Contains(m.RequiredPermission))
            .ToList();

        // Items that group others, judged from the full set — a parent stays a parent even
        // when every one of its children has been filtered away.
        var parentIds = rows.Where(m => m.ParentId is not null)
            .Select(m => m.ParentId!.Value)
            .ToHashSet();

        var childrenByParent = visible
            .Where(m => m.ParentId is not null)
            .GroupBy(m => m.ParentId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var tree = visible
            .Where(m => m.ParentId is null)
            .Select(parent =>
            {
                var children = childrenByParent.GetValueOrDefault(parent.Id, []);

                return new MenuItemDto(
                    parent.Id, parent.Label, parent.Path, parent.Icon,
                    [.. children.Select(c => new MenuItemDto(c.Id, c.Label, c.Path, c.Icon, []))]);
            })
            // Drop a container left with nothing to contain; it would render as a heading
            // that goes nowhere. Leaf items are always kept.
            .Where(item => !parentIds.Contains(item.Id) || item.Children.Count > 0)
            .ToList();

        return TypedResults.Ok<IReadOnlyList<MenuItemDto>>(tree);
    }
}
