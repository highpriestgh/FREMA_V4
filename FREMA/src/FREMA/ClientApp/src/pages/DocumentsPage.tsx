import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Paperclip, Search } from "lucide-react";
import { api } from "@/lib/api";
import {
  DocumentStatus, documentStatusLabel, Permission,
  type DocumentSummary, type PagedResult,
} from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/auth/AuthContext";
import { flattenFolders, type Folder } from "@/lib/folders";
import { FolderTree } from "@/components/documents/FolderTree";
import { TableRowsSkeleton, TreeSkeleton } from "@/components/layout/PageSkeletons";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export function statusVariant(status: DocumentStatus) {
  switch (status) {
    case DocumentStatus.Approved:
      return "default" as const;
    case DocumentStatus.Rejected:
      return "destructive" as const;
    case DocumentStatus.Returned:
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export function DocumentsPage() {
  const { can } = useAuth();
  const [data, setData] = useState<PagedResult<DocumentSummary> | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [failed, setFailed] = useState(false);
  const toast = useToast();

  const { data: folders, reload: reloadFolders } = useApi<Folder[]>("/api/folders");
  const folderPath = folderId
    ? flattenFolders(folders ?? []).find((f) => f.id === folderId)?.path
    : null;

  useEffect(() => {
    const controller = new AbortController();

    // Debounced so typing does not fire a request per keystroke; the abort signal drops
    // any response that a newer query has already superseded.
    setFetching(true);
    const timer = setTimeout(() => {
      void api
        .get<PagedResult<DocumentSummary>>(
          "/api/documents",
          { q: query, page, folderId: folderId ?? undefined },
          controller.signal,
        )
        .then((result) => {
          setData(result);
          setFailed(false);
          setFetching(false);
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          setFailed(true);
          setFetching(false);
          toast.fromError(error, "Couldn't load documents");
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // toast is stable for the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, folderId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={folderPath ?? "Documents"}
        description={
          folderPath
            ? "Documents filed directly in this folder."
            : "Everything you have raised or been involved with."
        }
      />

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <Card className="h-fit p-2">
          {folders === null ? <TreeSkeleton /> : <FolderTree
            tree={folders}
            selectedId={folderId}
            onSelect={(id) => {
              setFolderId(id);
              setPage(1);
            }}
            canManage={can(Permission.ManageFolders)}
            onChanged={reloadFolders}
          />}
        </Card>

        <div className="min-w-0 space-y-6">
          <div className="relative max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search by title or number…"
              className="pl-9"
              aria-label="Search documents"
            />
          </div>

          <Card
            className={cn("overflow-hidden p-0 transition-opacity", fetching && data && "opacity-60")}
            aria-busy={fetching}
          >
            {/* Wide tables scroll inside their own container so the page never scrolls sideways. */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-36">Step</TableHead>
                    <TableHead className="w-32">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data === null && !failed && <TableRowsSkeleton columns={6} />}
                  {data?.items.map((document) => (
                    <TableRow key={document.id} className="cursor-pointer">
                      <TableCell className="font-mono text-xs">
                        <Link to={`/documents/${document.id}`} className="hover:underline">
                          {document.number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link to={`/documents/${document.id}`} className="flex items-center gap-2 font-medium hover:underline">
                          {document.title}
                          {document.hasFile && (
                            <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-label="Has attachment" />
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{document.documentType ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(document.status)}>
                          {documentStatusLabel[document.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{document.currentStep ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(document.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}

                  {data?.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                        No documents found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Page {data.page} of {data.totalPages} · {data.totalCount} documents
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.hasPrevious}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
