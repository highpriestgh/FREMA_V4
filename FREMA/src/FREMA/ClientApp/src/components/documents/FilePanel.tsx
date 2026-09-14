import { useRef, useState } from "react";
import { Download, FileText, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { DocumentDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";

function formatSize(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePanel({
  document: doc,
  canEdit,
  onChanged,
}: {
  document: DocumentDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      await api.upload(`/api/documents/${doc.id}/content`, file);
      toast.success("File attached", file.name);
      onChanged();
    } catch (error) {
      // The server rejects a file whose bytes do not match its extension, and says so —
      // worth surfacing verbatim, because "contents do not match its '.pdf' extension" is
      // far more useful than "upload failed".
      toast.fromError(error, "Could not attach that file");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const contentUrl = `/api/documents/${doc.id}/content`;

  return (
    <div className="space-y-3">
      {doc.file ? (
        <>
          <div className="flex items-center gap-3 rounded-md border p-3">
            <FileText className="text-muted-foreground size-8 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{doc.file.fileName}</p>
              <p className="text-muted-foreground text-xs">
                {doc.file.contentType} · {formatSize(doc.file.sizeBytes)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Opened rather than downloaded: the endpoint serves real bytes with a real
                content type and supports range requests, so the browser's own viewer can
                page through a PDF without pulling all of it. */}
            <Button asChild variant="outline" size="sm">
              <a href={contentUrl} target="_blank" rel="noreferrer">
                <FileText className="size-4" aria-hidden />
                Open
              </a>
            </Button>

            <Button asChild variant="outline" size="sm">
              <a href={`${contentUrl}?download=true`}>
                <Download className="size-4" aria-hidden />
                Download
              </a>
            </Button>

            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <Upload className="size-4" aria-hidden />
                Replace
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-md border border-dashed p-6 text-center">
          <p className="text-muted-foreground text-sm">No file attached.</p>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              {busy ? "Uploading…" : "Attach a file"}
            </Button>
          )}
        </div>
      )}

      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
