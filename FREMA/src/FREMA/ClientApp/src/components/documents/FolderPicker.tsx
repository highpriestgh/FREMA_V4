import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Permission } from "@/lib/types";
import { flattenFolders, type Folder } from "@/lib/folders";

/**
 * The document's folder, as a "Details" row.
 *
 * Holders of `folders.manage` can refile it here at any status — approved documents are the
 * ones that get filed. Everyone else sees the folder path read-only.
 */
export function FolderPicker({
  documentId,
  folderId,
  onMoved,
}: {
  documentId: string;
  folderId: string | null;
  onMoved: () => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: tree } = useApi<Folder[]>("/api/folders");
  const [busy, setBusy] = useState(false);

  const folders = flattenFolders(tree ?? []);
  const current = folders.find((f) => f.id === folderId);

  async function move(next: string) {
    setBusy(true);
    try {
      await api.put(`/api/documents/${documentId}/folder`, { folderId: next || null });
      toast.success(next ? "Document filed" : "Removed from folder");
      onMoved();
    } catch (error) {
      toast.fromError(error, "Could not move this document");
    } finally {
      setBusy(false);
    }
  }

  if (!can(Permission.ManageFolders)) {
    return (
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground shrink-0">Folder</span>
        <span className="truncate text-right">{current?.path ?? "—"}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor="doc-folder" className="text-muted-foreground shrink-0">Folder</label>
      <select
        id="doc-folder"
        value={folderId ?? ""}
        disabled={busy}
        onChange={(event) => void move(event.target.value)}
        className="border-input bg-background h-8 min-w-0 max-w-[65%] rounded-md border px-2 text-right text-sm"
      >
        <option value="">Not filed</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>{f.path}</option>
        ))}
      </select>
    </div>
  );
}
