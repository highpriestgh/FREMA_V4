"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAuditLog, type AuditEntry, type AuditEntityType } from "@/lib/audit-mock";
import { ScrollText } from "lucide-react";

const ENTITY_TYPES: { value: AuditEntityType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "document", label: "Document" },
  { value: "workflow", label: "Workflow" },
  { value: "comment", label: "Comment" },
  { value: "annotation", label: "Annotation" },
  { value: "user", label: "User" },
  { value: "folder", label: "Folder" },
];

const ACTION_OPTIONS = [
  "all",
  "Document viewed",
  "Document uploaded",
  "Document routed",
  "Document stage advanced",
  "Document approved",
  "Document rejected",
  "Comment added",
  "Annotation added",
  "Folder created",
];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");

  const entries = useMemo(() => {
    const filters: { action?: string; entityType?: AuditEntityType } = {};
    if (actionFilter !== "all") filters.action = actionFilter;
    if (entityTypeFilter !== "all") filters.entityType = entityTypeFilter as AuditEntityType;
    return getAuditLog(filters);
  }, [actionFilter, entityTypeFilter]);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Audit Trail
        </h1>
        <p className="text-slate-500 mt-2">
          View all system actions and activity logs.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-blue-600" />
            Activity Log
          </CardTitle>
          <CardDescription>
            Filter by action or entity type. Data is in-memory for Phase 3.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500">Action</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a === "all" ? "All actions" : a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500">Entity type</label>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-[140px]">Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                    No audit entries match the filters.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry: AuditEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-slate-600 text-sm whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell className="font-medium">{entry.userName}</TableCell>
                    <TableCell>{entry.action}</TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {entry.entityType}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {entry.entityId ? (
                        <Link
                          href={entry.entityType === "document" ? `/inbox/${entry.entityId}` : "#"}
                          className="text-blue-600 hover:underline"
                        >
                          {entry.entityId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm max-w-[200px] truncate">
                      {entry.details ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
