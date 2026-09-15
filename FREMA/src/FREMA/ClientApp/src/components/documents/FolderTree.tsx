import { useState } from "react";
import {
  ChevronDown, ChevronRight, Folder as FolderIcon, FolderOpen, FolderPlus, Files, Pencil, Trash2, X, Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { Folder } from "@/lib/folders";
import { cn } from "@/lib/utils";

type Draft =
  | { kind: "create"; parentId: string | null }
  | { kind: "rename"; folder: Folder }
  | null;

/**
 * Folder navigation for the documents list. Selecting a folder filters the list to
 * documents filed directly in it. Holders of `folders.manage` can also add, rename and remove
 * folders here; the server enforces the same permission.
 */
export function FolderTree({
  tree,
  selectedId,
  onSelect,
  canManage,
  onChanged,
}: {
  tree: Folder[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft>(null);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit(name: string) {
    if (!draft || !name.trim()) return;

    try {
      if (draft.kind === "create") {
        await api.post("/api/folders", { name: name.trim(), parentId: draft.parentId });
        if (draft.parentId) setExpanded((current) => new Set(current).add(draft.parentId!));
        toast.success("Folder created");
      } else {
        const f = draft.folder;
        await api.put(`/api/folders/${f.id}`, {
          name: name.trim(),
          description: f.description,
          icon: f.icon,
          parentId: f.parentId,
        });
        toast.success("Folder renamed");
      }
      setDraft(null);
      onChanged();
    } catch (error) {
      toast.fromError(error, "Could not save the folder");
    }
  }

  async function remove(folder: Folder) {
    try {
      await api.delete(`/api/folders/${folder.id}`);
      if (selectedId === folder.id) onSelect(null);
      toast.success("Folder deleted");
      onChanged();
    } catch (error) {
      // The server refuses to delete a folder that still holds documents or subfolders,
      // and says which.
      toast.fromError(error, "Could not delete the folder");
    }
  }

  function renderNode(folder: Folder, depth: number) {
    const isOpen = expanded.has(folder.id);
    const hasChildren = folder.children.length > 0;
    const isSelected = selectedId === folder.id;
    const isRenaming = draft?.kind === "rename" && draft.folder.id === folder.id;

    return (
      <li key={folder.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 text-sm",
            isSelected ? "bg-accent font-medium" : "hover:bg-accent/50",
          )}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          <button
            type="button"
            className={cn("text-muted-foreground grid size-5 shrink-0 place-items-center", !hasChildren && "invisible")}
            onClick={() => toggle(folder.id)}
            aria-label={isOpen ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            aria-expanded={isOpen}
          >
            {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>

          {isRenaming ? (
            <NameInput initial={folder.name} onSubmit={submit} onCancel={() => setDraft(null)} />
          ) : (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
              onClick={() => onSelect(folder.id)}
              aria-current={isSelected ? "true" : undefined}
            >
              {isSelected ? <FolderOpen className="size-4 shrink-0" aria-hidden /> : <FolderIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />}
              <span className="truncate">{folder.name}</span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">{folder.documentCount || ""}</span>
            </button>
          )}

          {canManage && !isRenaming && (
            <span className="hidden shrink-0 items-center group-focus-within:flex group-hover:flex">
              <IconButton label={`New folder inside ${folder.name}`} onClick={() => setDraft({ kind: "create", parentId: folder.id })}>
                <FolderPlus className="size-3.5" />
              </IconButton>
              <IconButton label={`Rename ${folder.name}`} onClick={() => setDraft({ kind: "rename", folder })}>
                <Pencil className="size-3.5" />
              </IconButton>
              <IconButton label={`Delete ${folder.name}`} onClick={() => void remove(folder)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </span>
          )}
        </div>

        {draft?.kind === "create" && draft.parentId === folder.id && (
          <div style={{ paddingLeft: `${(depth + 1) * 14 + 26}px` }} className="py-1">
            <NameInput initial="" onSubmit={submit} onCancel={() => setDraft(null)} />
          </div>
        )}

        {isOpen && hasChildren && <ul>{folder.children.map((child) => renderNode(child, depth + 1))}</ul>}
      </li>
    );
  }

  return (
    <nav aria-label="Folders" className="space-y-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={selectedId === null ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
          selectedId === null ? "bg-accent font-medium" : "hover:bg-accent/50",
        )}
      >
        <Files className="size-4" aria-hidden />
        All documents
      </button>

      <ul>{tree.map((folder) => renderNode(folder, 0))}</ul>

      {tree.length === 0 && <p className="text-muted-foreground px-2 py-1 text-xs">No folders yet.</p>}

      {canManage &&
        (draft?.kind === "create" && draft.parentId === null ? (
          <div className="px-1 pt-1">
            <NameInput initial="" onSubmit={submit} onCancel={() => setDraft(null)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDraft({ kind: "create", parentId: null })}
            className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-2 pt-2 text-sm"
          >
            <FolderPlus className="size-4" aria-hidden />
            New folder
          </button>
        ))}
    </nav>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="text-muted-foreground hover:text-foreground rounded p-1">
      {children}
    </button>
  );
}

function NameInput({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);

  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onCancel()}
        placeholder="Folder name"
        aria-label="Folder name"
        className="border-input bg-background h-7 min-w-0 flex-1 rounded border px-2 text-sm"
      />
      <button type="submit" aria-label="Save folder" className="text-muted-foreground hover:text-foreground p-1">
        <Check className="size-3.5" />
      </button>
      <button type="button" aria-label="Cancel" onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1">
        <X className="size-3.5" />
      </button>
    </form>
  );
}
