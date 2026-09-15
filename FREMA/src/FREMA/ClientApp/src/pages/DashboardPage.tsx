import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Clock, CornerUpLeft, FileEdit, Flame, Inbox, Upload,
  type LucideIcon,
} from "lucide-react";
import { useApi } from "@/lib/useApi";
import { DashboardSkeleton } from "@/components/layout/PageSkeletons";
import { useAuth } from "@/auth/AuthContext";
import { DocumentStatus, Permission, type Dashboard } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// --- Colour ------------------------------------------------------------------
// Status colours carry meaning (green approved, amber returned, red rejected), so they come
// from a fixed status palette and always sit beside their label — never colour alone.

const statusColour: Record<DocumentStatus, string> = {
  [DocumentStatus.Draft]: "#a3a3a3",
  [DocumentStatus.Pending]: "#2a78d6",
  [DocumentStatus.Returned]: "#fab219",
  [DocumentStatus.Approved]: "#0ca30c",
  [DocumentStatus.Rejected]: "#d03b3b",
  [DocumentStatus.Archived]: "#6b6b6b",
};

/** Each tile has its own colour, so the six figures are easy to tell apart at a glance. */
const tileTone = {
  blue: "bg-blue-500/10 text-blue-700",
  red: "bg-red-500/10 text-red-700",
  orange: "bg-orange-500/10 text-orange-700",
  amber: "bg-amber-500/15 text-amber-700",
  violet: "bg-violet-500/10 text-violet-700",
  teal: "bg-teal-500/10 text-teal-700",
} as const;

type Tone = keyof typeof tileTone;

export function DashboardPage() {
  const { profile, can } = useAuth();
  const { data, initialLoading } = useApi<Dashboard>("/api/dashboard");

  if (initialLoading) {
    return <DashboardSkeleton />;
  }

  const work = data?.myWork;

  return (
    <div className="space-y-6">
      <WelcomeBanner
        firstName={profile?.fullName.split(" ")[0] ?? "there"}
        waiting={work?.awaitingMe ?? 0}
        overdue={work?.overdueForMe ?? 0}
        canUpload={can(Permission.UploadDocuments)}
      />

      {/* Compact tiles: two rows on most screens, one row of six on very wide ones. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Awaiting your action" value={work?.awaitingMe} icon={Inbox} to="/inbox" tone="blue" />
        <Stat label="Overdue" value={work?.overdueForMe} icon={Clock} to="/inbox" tone="red" alert={Boolean(work?.overdueForMe)} />
        <Stat label="Urgent" value={work?.urgentForMe} icon={Flame} to="/inbox" tone="orange" />
        <Stat label="Returned to you" value={work?.returnedToMe} icon={CornerUpLeft} to="/inbox" tone="amber" />
        <Stat label="Your drafts" value={work?.myDraft} icon={FileEdit} to="/documents" tone="violet" />
        <Stat label="In progress" value={work?.myInProgress} icon={AlertTriangle} to="/documents" tone="teal" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data && <StatusBreakdown rows={data.byStatus} />}

        {/* Departmental load is a management view; the server returns it empty for users
            who cannot see every document, because a partial figure would mislead. */}
        {data && data.byDepartment.length > 0 && <DepartmentLoad rows={data.byDepartment} />}
      </div>

      {data && data.recentActivity.length > 0 && <RecentActivity entries={data.recentActivity} />}
    </div>
  );
}

// --- Welcome -----------------------------------------------------------------

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function WelcomeBanner({
  firstName, waiting, overdue, canUpload,
}: { firstName: string; waiting: number; overdue: number; canUpload: boolean }) {
  const summary =
    waiting === 0
      ? "You're all caught up — nothing is waiting on you."
      : `${waiting} document${waiting === 1 ? " is" : "s are"} waiting on you${overdue ? `, ${overdue} overdue` : ""}.`;

  return (
    <div className="relative overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50/70 to-white p-6">
      {/* Soft decorative shapes — purely ornamental. */}
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-blue-200/40 blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute right-40 -bottom-20 size-40 rounded-full bg-indigo-200/40 blur-2xl" aria-hidden />

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-blue-700">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className={cn("text-sm", overdue ? "text-red-700" : "text-muted-foreground")}>{summary}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild className="bg-blue-600 text-white hover:bg-blue-700">
            <Link to="/inbox">
              Open inbox
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          {canUpload && (
            <Button asChild variant="outline" className="bg-white/70">
              <Link to="/upload">
                <Upload className="size-4" aria-hidden />
                Register a document
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Tiles -------------------------------------------------------------------

function Stat({
  label, value, icon: IconComponent, to, tone, alert = false,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  to: string;
  tone: Tone;
  /** Draws attention when the figure needs acting on, e.g. overdue items. */
  alert?: boolean;
}) {
  return (
    <Link to={to} className="group focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none">
      {/* py-0: the card's own vertical padding would stack with the content's and leave the tile tall. */}
      <Card className={cn("py-0 transition-shadow group-hover:shadow-md motion-reduce:transition-none", alert && "border-red-200")}>
        <CardContent className="flex items-center gap-3 px-3 py-2.5">
          <div className={cn("shrink-0 rounded-md p-1.5", tileTone[tone])}>
            <IconComponent className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            {/* An em dash when the figure is unavailable, rather than a zero that reads as real data. */}
            <p className={cn("text-lg leading-tight font-semibold tabular-nums", alert && "text-red-700")}>{value ?? "—"}</p>
            <p className="text-muted-foreground truncate text-xs" title={label}>{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// --- Status breakdown ----------------------------------------------------------

function StatusBreakdown({ rows }: { rows: Dashboard["byStatus"] }) {
  const [hover, setHover] = useState<DocumentStatus | null>(null);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const visible = rows.filter((r) => r.count > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between">
        <CardTitle className="text-base">Documents by status</CardTitle>
        <span className="text-muted-foreground text-sm tabular-nums">{total} total</span>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* One bar split by share, with a thin gap between segments so neighbours never merge. */}
        <div
          className="flex h-3 gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={visible.map((r) => `${r.label} ${r.count}`).join(", ") || "No documents"}
        >
          {total === 0 && <div className="bg-muted h-full w-full" />}
          {visible.map((r) => (
            <div
              key={r.status}
              className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(r.count / total) * 100}%`,
                background: statusColour[r.status],
                opacity: hover === null || hover === r.status ? 1 : 0.35,
              }}
              onPointerEnter={() => setHover(r.status)}
              onPointerLeave={() => setHover(null)}
              title={`${r.label}: ${r.count}`}
            />
          ))}
        </div>

        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {rows.map((r) => (
            <li
              key={r.status}
              className={cn("-mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm", hover === r.status && "bg-accent")}
              onPointerEnter={() => setHover(r.status)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: statusColour[r.status] }} aria-hidden />
              <span className="text-muted-foreground flex-1">{r.label}</span>
              <span className="font-medium tabular-nums">{r.count}</span>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                {total ? `${Math.round((r.count / total) * 100)}%` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// --- Department load -----------------------------------------------------------

function DepartmentLoad({ rows }: { rows: Dashboard["byDepartment"] }) {
  const max = Math.max(1, ...rows.map((r) => r.pending));

  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between">
        <CardTitle className="text-base">Waiting by department</CardTitle>
        <span className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#2a78d6]" aria-hidden />On time</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#d03b3b]" aria-hidden />Overdue</span>
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => {
          const onTime = r.pending - r.overdue;
          return (
            <div key={r.department} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">{r.department}</span>
                <span className="tabular-nums">
                  {r.pending}
                  {r.overdue > 0 && <span className="ml-2 text-red-700">{r.overdue} overdue</span>}
                </span>
              </div>
              <div className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {onTime > 0 && <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(onTime / max) * 100}%` }} />}
                {r.overdue > 0 && <div className="h-full rounded-full bg-[#d03b3b]" style={{ width: `${(r.overdue / max) * 100}%` }} />}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// --- Activity --------------------------------------------------------------------

/** Plain-language verbs for audit actions, and the colour of their marker. */
function describe(action: string): { verb: string; colour: string } {
  const map: Record<string, [string, string]> = {
    "document.created": ["registered", "#2a78d6"],
    "document.submitted": ["submitted", "#2a78d6"],
    "document.routed": ["moved on", "#2a78d6"],
    "document.approved": ["approved", "#0ca30c"],
    "document.completed": ["completed", "#0ca30c"],
    "document.reviewed": ["reviewed", "#0ca30c"],
    "document.returned": ["returned", "#fab219"],
    "document.rejected": ["sent back", "#fab219"],
    "document.abandoned": ["abandoned", "#d03b3b"],
    "document.deleted": ["deleted", "#d03b3b"],
    "document.content.uploaded": ["attached a file to", "#7c3aed"],
    "document.content.deleted": ["removed the file from", "#7c3aed"],
    "document.filed": ["filed", "#0d9488"],
    "document.updated": ["edited", "#6b7280"],
    "comment.added": ["commented on", "#6b7280"],
    "user.created": ["added a user", "#6b7280"],
    "user.updated": ["updated a user", "#6b7280"],
    "user.password.changed": ["changed their password", "#6b7280"],
    "role.created": ["created a role", "#6b7280"],
    "role.updated": ["changed a role", "#6b7280"],
    "workflow.created": ["created an approval route", "#6b7280"],
    "workflow.updated": ["edited an approval route", "#6b7280"],
    "workflow.versioned": ["edited an approval route", "#6b7280"],
    "workflow.default": ["changed the default route", "#6b7280"],
    "folder.created": ["created a folder", "#0d9488"],
    "folder.updated": ["renamed a folder", "#0d9488"],
    "folder.deleted": ["deleted a folder", "#0d9488"],
    "settings.updated": ["updated settings", "#6b7280"],
    "settings.logo.updated": ["changed the logo", "#6b7280"],
    "settings.logo.removed": ["removed the logo", "#6b7280"],
  };
  // Anything not listed still reads as words rather than an internal code.
  const [verb, colour] = map[action] ?? [action.replace(/[._-]+/g, " "), "#9ca3af"];
  return { verb, colour };
}

function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let value = -seconds;
  for (const [step, unit] of units) {
    if (Math.abs(value) < step) return format.format(Math.round(value), unit);
    value /= step;
  }
  return format.format(Math.round(value), "year");
}

const ACTIVITY_PAGE_SIZE = 5;

function RecentActivity({ entries }: { entries: Dashboard["recentActivity"] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(entries.length / ACTIVITY_PAGE_SIZE));

  // If the list shrinks on a reload, stay on a page that still exists.
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  const start = page * ACTIVITY_PAGE_SIZE;
  const shown = entries.slice(start, start + ACTIVITY_PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recent activity</CardTitle>
        <span className="text-muted-foreground text-xs tabular-nums">
          {start + 1}–{start + shown.length} of {entries.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* A fixed height for five rows, so paging does not make the card jump. */}
        <ol className="min-h-[9.25rem] space-y-3" aria-live="polite">
          {shown.map((entry, index) => {
            const { verb, colour } = describe(entry.action);
            return (
              <li key={start + index} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: colour }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{entry.user ?? "System"}</span>{" "}
                  <span className="text-muted-foreground">{verb}</span>{" "}
                  {entry.documentTitle && (
                    <Link to={`/documents/${entry.documentId}`} className="font-medium hover:underline">
                      {entry.documentTitle}
                    </Link>
                  )}
                </span>
                <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()} className="text-muted-foreground shrink-0 text-xs">
                  {timeAgo(entry.at)}
                </time>
              </li>
            );
          })}
        </ol>

        {pages > 1 && (
          <nav className="flex items-center justify-between gap-2 border-t pt-3" aria-label="Recent activity pages">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Button>
            {/* Page numbers need room; on phones a short "Page 2 of 10" takes their place. */}
            <span className="text-muted-foreground text-xs tabular-nums sm:hidden">
              Page {page + 1} of {pages}
            </span>
            <div className="hidden items-center gap-1 sm:flex">
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`Page ${i + 1}`}
                  aria-current={i === page ? "page" : undefined}
                  className={cn(
                    "size-7 rounded-md text-xs tabular-nums transition-colors",
                    i === page ? "bg-blue-600 font-medium text-white" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={page === pages - 1} onClick={() => setPage((p) => p + 1)}>
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
