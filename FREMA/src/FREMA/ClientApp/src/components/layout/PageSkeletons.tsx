import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholders shaped like the pages they stand in for, so the layout does not jump when data
 * arrives. Each is announced once to screen readers as "Loading"; the shapes themselves are
 * hidden from them.
 */

function Busy({ label = "Loading", children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

export function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-[60vw]" />
      </div>
      {action && <Skeleton className="h-9 w-28" />}
    </div>
  );
}

export function StatTilesSkeleton({ count = 6, className = "sm:grid-cols-2 lg:grid-cols-3" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-4 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="py-0">
          <CardContent className="flex items-center gap-4 p-5">
            <Skeleton className="size-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Rows only — for use inside an existing table body, so headers stay put while pages change. */
export function TableRowsSkeleton({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-b last:border-0" aria-hidden>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="p-2 py-3">
              <Skeleton className="h-4" style={{ width: `${c === 1 ? 70 : 40 + ((r * 7 + c * 13) % 45)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A whole table card, for pages that have nothing to show until the first response. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {Array.from({ length: columns }, (_, c) => (
              <th key={c} className="h-10 px-2 text-left">
                <Skeleton className="h-3.5 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <TableRowsSkeleton rows={rows} columns={columns} />
        </tbody>
      </table>
    </Card>
  );
}

export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="space-y-2">
              <Skeleton className="ml-auto h-3.5 w-20" />
              <Skeleton className="ml-auto h-3.5 w-24" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function PanelSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
        ))}
      </CardContent>
    </Card>
  );
}

// --- Whole pages -------------------------------------------------------------

/** Matches the dashboard's compact tiles. */
function CompactTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} className="py-0">
          <CardContent className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-7 rounded-md" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-3 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Busy label="Loading dashboard">
      <div className="space-y-6">
        <div className="space-y-3 rounded-xl border p-6">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <CompactTilesSkeleton />
        <div className="grid gap-4 lg:grid-cols-2">
          <PanelSkeleton lines={6} />
          <PanelSkeleton lines={3} />
        </div>
        <PanelSkeleton lines={6} />
      </div>
    </Busy>
  );
}

export function InboxSkeleton() {
  return (
    <Busy label="Loading inbox">
      <CardListSkeleton />
    </Busy>
  );
}

export function DocumentDetailSkeleton() {
  return (
    <Busy label="Loading document">
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <HeaderSkeleton action />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent className="space-y-5">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3.5 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <PanelSkeleton lines={3} />
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader><Skeleton className="h-5 w-16" /></CardHeader>
              <CardContent><Skeleton className="h-24 w-full" /></CardContent>
            </Card>
            <PanelSkeleton lines={6} />
          </div>
        </div>
      </div>
    </Busy>
  );
}

export function FormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <Busy>
      <div className="space-y-6">
        <HeaderSkeleton action />
        {Array.from({ length: sections }, (_, s) => (
          <Card key={s}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 2 }, (_, f) => (
                <div key={f} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </Busy>
  );
}

export function ReportsSkeleton() {
  return (
    <Busy label="Loading reports">
      <div className="space-y-4">
        <StatTilesSkeleton count={6} className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><Skeleton className="h-5 w-56" /></CardHeader>
            <CardContent><Skeleton className="h-56 w-full" /></CardContent>
          </Card>
          <PanelSkeleton lines={5} />
        </div>
        <TableSkeleton rows={3} columns={5} />
      </div>
    </Busy>
  );
}

/** The whole signed-in shell, shown while the session itself is being checked. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <aside className="bg-sidebar hidden w-64 shrink-0 border-r md:block">
        <div className="flex h-14 items-center border-b px-5">
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex-1">
        <div className="flex h-14 items-center justify-end gap-3 border-b px-4 md:px-8">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
        </div>
        <main className="space-y-6 p-4 md:p-8">
          <HeaderSkeleton />
          <StatTilesSkeleton />
        </main>
      </div>
    </div>
  );
}

export function TreeSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-2 p-1" aria-hidden>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 12}px` }}>
          <Skeleton className="size-4" />
          <Skeleton className="h-4" style={{ width: `${50 + ((i * 23) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}
