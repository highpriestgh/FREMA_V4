import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "@/lib/useApi";
import { TableRowsSkeleton } from "@/components/layout/PageSkeletons";
import type { PagedResult } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface AuditEntry {
  id: number;
  action: string;
  entityType: number;
  entityId: string | null;
  details: string | null;
  userId: string | null;
  userName: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export function AuditPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  if (action) query.set("action", action);
  query.set("page", String(page));

  const { data, initialLoading } = useApi<PagedResult<AuditEntry>>(`/api/audit?${query}`, [action, page]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description="Every recorded action, written server-side and append-only."
      />

      <Input
        value={action}
        onChange={(event) => {
          setAction(event.target.value);
          setPage(1);
        }}
        placeholder="Filter by action, e.g. document.approved"
        className="max-w-sm"
        aria-label="Filter by action"
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">When</TableHead>
                <TableHead className="w-56">Action</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="w-32">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialLoading && <TableRowsSkeleton rows={10} columns={5} />}
              {data?.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                  <TableCell className="text-sm">
                    {/* Denormalised on the server, so the entry stays readable even after
                        the user it refers to has been removed. */}
                    {entry.userName ?? <span className="text-muted-foreground">System</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate text-xs">
                    {entry.entityId ? (
                      <Link to={`/documents/${entry.entityId}`} className="hover:underline">
                        {entry.details ?? entry.entityId}
                      </Link>
                    ) : (
                      entry.details
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {entry.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))}

              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
                    No matching entries.
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
            Page {data.page} of {data.totalPages} · {data.totalCount} entries
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data.hasPrevious} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
