import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ScanLine, Upload as UploadIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/toast";
import type { DocumentDetail, ReferenceItem } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScannerModal } from "@/components/scanner/scanner-modal";

/**
 * Registers a document: metadata first, then content.
 *
 * Two steps because they are two different things on the server — a document row, then a
 * streamed upload against it. That also means a scan and a picked file follow exactly the
 * same path: the scanner hands back a `File`, and from there nothing can tell them apart.
 */
export function UploadPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const { data: types } = useApi<ReferenceItem[]>("/api/document-types");
  const { data: origins } = useApi<ReferenceItem[]>("/api/origins");

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [typeId, setTypeId] = useState("");
  const [originId, setOriginId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) {
      toast.error("A title is required");
      return;
    }

    setBusy(true);
    try {
      const created = await api.post<DocumentDetail>("/api/documents", {
        title: title.trim(),
        summary: summary.trim() || null,
        documentTypeId: typeId || null,
        originId: originId || null,
      });

      if (file) {
        // Attached separately so a rejected file — wrong type, too large — leaves the
        // document in place to retry against, rather than losing the metadata too.
        await api.upload(`/api/documents/${created.id}/content`, file);
      }

      toast.success("Document registered", created.number);
      navigate(`/documents/${created.id}`);
    } catch (error) {
      toast.fromError(error, "Could not register this document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Register a document"
        description="Add a document to the system, then send it for approval."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What is this document?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Optional — a line or two of context."
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  value={typeId}
                  onChange={(event) => setTypeId(event.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">Not specified</option>
                  {types?.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {/* The type can select a different approval route, so it is worth setting. */}
                <p className="text-muted-foreground text-xs">
                  May determine which approval route the document follows.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="origin">Origin</Label>
                <select
                  id="origin"
                  value={originId}
                  onChange={(event) => setOriginId(event.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">Not specified</option>
                  {origins?.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Register document"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">File</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {file ? (
              <div className="flex items-center gap-3 rounded-md border p-3">
                <FileText className="text-muted-foreground size-8 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove file"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="hover:bg-accent/50 block cursor-pointer rounded-md border border-dashed p-6 text-center">
                  <UploadIcon className="text-muted-foreground mx-auto size-6" aria-hidden />
                  <span className="mt-2 block text-sm font-medium">Choose a file</span>
                  <span className="text-muted-foreground block text-xs">
                    PDF, image or Office document
                  </span>
                  <input
                    type="file"
                    hidden
                    accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>

                <div className="flex items-center gap-2">
                  <span className="bg-border h-px flex-1" />
                  <span className="text-muted-foreground text-xs">or</span>
                  <span className="bg-border h-px flex-1" />
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setScanning(true)}
                >
                  <ScanLine className="size-4" aria-hidden />
                  Scan with camera
                </Button>
              </div>
            )}

            <p className="text-muted-foreground text-xs">
              You can also attach the file later, from the document itself.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* The scanner returns a finished multi-page PDF, so it joins the same upload path
          a picked file takes. */}
      {scanning && (
        <ScannerModal
          onClose={() => setScanning(false)}
          onComplete={(scanned) => {
            setFile(scanned);
            setScanning(false);
            toast.success("Scan ready", scanned.name);
          }}
        />
      )}
    </div>
  );
}
