import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, CornerUpLeft, FileEdit, Flame, Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import type { Dashboard } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    void api.get<Dashboard>("/api/dashboard").then(setData);
  }, []);

  const work = data?.myWork;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${profile?.fullName.split(" ")[0] ?? "there"}`}
        description="What needs your attention today."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Awaiting your action"
          value={work?.awaitingMe}
          icon={Inbox}
          to="/inbox"
        />
        <Stat
          label="Overdue"
          value={work?.overdueForMe}
          icon={Clock}
          to="/inbox"
          tone={work?.overdueForMe ? "danger" : undefined}
        />
        <Stat
          label="Urgent"
          value={work?.urgentForMe}
          icon={Flame}
          to="/inbox"
          tone={work?.urgentForMe ? "warning" : undefined}
        />
        <Stat
          label="Returned to you"
          value={work?.returnedToMe}
          icon={CornerUpLeft}
          to="/inbox"
          tone={work?.returnedToMe ? "warning" : undefined}
        />
        <Stat label="Your drafts" value={work?.myDraft} icon={FileEdit} to="/documents" />
        <Stat label="In progress" value={work?.myInProgress} icon={AlertTriangle} to="/documents" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.byStatus.map((row) => (
              <div key={row.status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium tabular-nums">{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Departmental load is a management view; the server returns it empty for users
            who cannot see every document, because a partial figure would mislead. */}
        {data && data.byDepartment.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending by department</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.byDepartment.map((row) => (
                <div key={row.department} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.department}</span>
                  <span className="tabular-nums">
                    {row.pending}
                    {row.overdue > 0 && (
                      <span className="text-destructive ml-2">{row.overdue} overdue</span>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {data && data.recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentActivity.map((entry, index) => (
              <div key={index} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{entry.user ?? "System"}</span>{" "}
                  <span className="text-muted-foreground">{entry.action}</span>{" "}
                  {entry.documentTitle && (
                    <Link
                      to={`/documents/${entry.documentId}`}
                      className="hover:underline"
                    >
                      {entry.documentTitle}
                    </Link>
                  )}
                </span>
                <time className="text-muted-foreground shrink-0 text-xs">
                  {new Date(entry.at).toLocaleString()}
                </time>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: IconComponent,
  to,
  tone,
}: {
  label: string;
  value: number | undefined;
  icon: typeof Inbox;
  to: string;
  tone?: "danger" | "warning";
}) {
  return (
    <Link to={to} className="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none">
      <Card className="hover:border-foreground/20 transition-colors">
        <CardContent className="flex items-center gap-4 p-5">
          <div
            className={
              tone === "danger"
                ? "bg-destructive/10 text-destructive rounded-lg p-2.5"
                : tone === "warning"
                  ? "rounded-lg bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-500"
                  : "bg-muted text-muted-foreground rounded-lg p-2.5"
            }
          >
            <IconComponent className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            {/* An em dash while loading, rather than a flash of zero that reads as real data. */}
            <p className="text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
            <p className="text-muted-foreground truncate text-sm">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
