import { Link } from "react-router-dom";
import { CornerUpLeft } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { InboxSkeleton } from "@/components/layout/PageSkeletons";
import { priorityLabel, Priority, type InboxItem, type PagedResult } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function InboxPage() {
  const { data, initialLoading } = useApi<PagedResult<InboxItem>>("/api/inbox");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Documents waiting on your decision."
      />

      {initialLoading && <InboxSkeleton />}

      {data?.items.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          Nothing is waiting on you.
        </Card>
      )}

      <div className="space-y-2">
        {data?.items.map((item) => (
          <Link key={item.routingId} to={`/documents/${item.documentId}`} className="block">
            <Card className="hover:border-foreground/20 p-4 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xs">{item.number}</span>

                    {/* A returned document is the one case where the reason matters more
                        than the title, so it is called out rather than left to the detail page. */}
                    {item.isReturn && (
                      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-500">
                        <CornerUpLeft className="size-3" aria-hidden />
                        Returned
                      </Badge>
                    )}

                    {item.priority >= Priority.High && (
                      <Badge variant={item.priority === Priority.Urgent ? "destructive" : "secondary"}>
                        {priorityLabel[item.priority]}
                      </Badge>
                    )}

                    {item.isOverdue && <Badge variant="destructive">Overdue</Badge>}
                  </div>

                  <p className="font-medium">{item.title}</p>

                  {item.note && (
                    <p className="text-muted-foreground text-sm">
                      <span className="font-medium">{item.routedBy}:</span> {item.note}
                    </p>
                  )}
                </div>

                <div className="text-muted-foreground shrink-0 text-right text-xs">
                  <p>{item.stepName}</p>
                  {item.dueDate && (
                    <p className={item.isOverdue ? "text-destructive" : undefined}>
                      Due {new Date(item.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
