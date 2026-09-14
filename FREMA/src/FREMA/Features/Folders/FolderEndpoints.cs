using Duende.Bff;
using FREMA.Common;
using FREMA.Domain;
using FREMA.Infrastructure.Auditing;
using FREMA.Infrastructure.Authorization;
using FREMA.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace FREMA.Features.Folders;

public sealed record FolderDto(
    Guid Id,
    string Name,
    string? Description,
    string? Icon,
    Guid? ParentId,
    int DocumentCount,
    IReadOnlyList<FolderDto> Children);

public sealed record SaveFolderRequest(string Name, string? Description, string? Icon, Guid? ParentId);

public static class FolderEndpoints
{
    public static IEndpointRouteBuilder MapFolderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/folders").WithTags("Folders");
        group.AsBffApiEndpoint();

        group.MapGet("/", TreeAsync).RequireAuthorization(Permissions.ViewDocuments);
        group.MapPost("/", CreateAsync).RequireAuthorization(Permissions.ManageFolders);
        group.MapPut("/{id:guid}", UpdateAsync).RequireAuthorization(Permissions.ManageFolders);
        group.MapDelete("/{id:guid}", DeleteAsync).RequireAuthorization(Permissions.ManageFolders);

        return app;
    }

    /// <summary>Flattened folder row, before the tree is assembled.</summary>
    private sealed record Row(Guid Id, string Name, string? Description, string? Icon, Guid? ParentId, int DocumentCount);

    /// <summary>
    /// The whole hierarchy in one query, assembled in memory.
    /// <para>
    /// Folder counts are small and the shape is a tree, so fetching all rows once beats the
    /// legacy approach of a stored procedure per parent — which meant one round trip per
    /// level every time the tree was drawn.
    /// </para>
    /// </summary>
    private static async Task<Ok<IReadOnlyList<FolderDto>>> TreeAsync(
        FremaDbContext db, CancellationToken ct)
    {
        var rows = await db.Folders.AsNoTracking()
            .OrderBy(f => f.Name)
            .Select(f => new Row(
                f.Id, f.Name, f.Description, f.Icon, f.ParentId,
                db.Documents.Count(d => d.FolderId == f.Id)))
            .ToListAsync(ct);

        var byParent = rows
            .Where(f => f.ParentId is not null)
            .GroupBy(f => f.ParentId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        FolderDto Build(Row row) => new(
            row.Id, row.Name, row.Description, row.Icon, row.ParentId, row.DocumentCount,
            [.. byParent.GetValueOrDefault(row.Id, []).Select(Build)]);

        var tree = rows.Where(f => f.ParentId is null).Select(Build).ToList();
        return TypedResults.Ok<IReadOnlyList<FolderDto>>(tree);
    }

    private static async Task<Created<FolderDto>> CreateAsync(
        SaveFolderRequest request,
        FremaDbContext db,
        ICurrentUser user,
        IAuditService audit,
        CancellationToken ct)
    {
        var name = Require(request.Name);

        if (request.ParentId is { } parentId
            && !await db.Folders.AnyAsync(f => f.Id == parentId, ct))
        {
            throw new NotFoundException("Parent folder", parentId);
        }

        if (await db.Folders.AnyAsync(f => f.ParentId == request.ParentId && f.Name == name, ct))
        {
            throw new ConflictException($"A folder named '{name}' already exists here.");
        }

        var folder = new Folder
        {
            Name = name,
            Description = request.Description?.Trim(),
            Icon = request.Icon,
            ParentId = request.ParentId,
            OwnerId = user.UserId,
        };

        db.Folders.Add(folder);
        audit.Record("folder.created", AuditEntityType.Folder, folder.Id, new { name });
        await db.SaveChangesAsync(ct);

        return TypedResults.Created(
            $"/api/folders/{folder.Id}",
            new FolderDto(folder.Id, folder.Name, folder.Description, folder.Icon, folder.ParentId, 0, []));
    }

    private static async Task<Ok<FolderDto>> UpdateAsync(
        Guid id,
        SaveFolderRequest request,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id, ct)
            ?? throw new NotFoundException("Folder", id);

        var name = Require(request.Name);

        if (request.ParentId != folder.ParentId)
        {
            await GuardAgainstCycleAsync(db, id, request.ParentId, ct);
        }

        if (await db.Folders.AnyAsync(
                f => f.ParentId == request.ParentId && f.Name == name && f.Id != id, ct))
        {
            throw new ConflictException($"A folder named '{name}' already exists here.");
        }

        folder.Name = name;
        folder.Description = request.Description?.Trim();
        folder.Icon = request.Icon;
        folder.ParentId = request.ParentId;
        folder.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Record("folder.updated", AuditEntityType.Folder, id, new { name });
        await db.SaveChangesAsync(ct);

        var count = await db.Documents.CountAsync(d => d.FolderId == id, ct);
        return TypedResults.Ok(new FolderDto(
            folder.Id, folder.Name, folder.Description, folder.Icon, folder.ParentId, count, []));
    }

    private static async Task<NoContent> DeleteAsync(
        Guid id,
        FremaDbContext db,
        IAuditService audit,
        CancellationToken ct)
    {
        var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id, ct)
            ?? throw new NotFoundException("Folder", id);

        if (await db.Folders.AnyAsync(f => f.ParentId == id, ct))
        {
            throw new ConflictException("This folder contains subfolders. Remove them first.");
        }

        var documents = await db.Documents.CountAsync(d => d.FolderId == id, ct);
        if (documents > 0)
        {
            throw new ConflictException(
                $"This folder holds {documents} document(s). Move them before deleting it.");
        }

        db.Folders.Remove(folder);
        audit.Record("folder.deleted", AuditEntityType.Folder, id, new { folder.Name });
        await db.SaveChangesAsync(ct);

        return TypedResults.NoContent();
    }

    /// <summary>
    /// Refuses a move that would make a folder its own ancestor. Walking up from the
    /// proposed parent is enough: if it reaches the folder being moved, the link closes a
    /// loop — and a cycle would make the tree query recurse forever.
    /// </summary>
    private static async Task GuardAgainstCycleAsync(
        FremaDbContext db, Guid folderId, Guid? newParentId, CancellationToken ct)
    {
        var cursor = newParentId;

        while (cursor is { } current)
        {
            if (current == folderId)
            {
                throw new DomainRuleException(
                    "A folder cannot be moved inside itself or one of its own subfolders.");
            }

            cursor = await db.Folders
                .Where(f => f.Id == current)
                .Select(f => f.ParentId)
                .FirstOrDefaultAsync(ct);
        }
    }

    private static string Require(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new DomainRuleException("A folder name is required.")
            : value.Trim();
}
