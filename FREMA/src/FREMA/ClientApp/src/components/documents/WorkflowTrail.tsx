import { Check, CornerUpLeft, Clock, Eye, X } from "lucide-react";
import { RoutingStatus, Priority, priorityLabel, type Routing } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The document's full routing history, in order.
 *
 * Deliberately a trail rather than a fixed stepper: routes are configured per organisation,
 * so the number and names of the steps are not known until the document is on one. The
 * prototype hardcoded four stages, which could only ever describe one organisation's process.
 */
export function WorkflowTrail({ routings }: { routings: Routing[] }) {
  if (routings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Not yet submitted to a workflow.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {routings.map((routing, index) => (
        <li key={routing.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <StatusMarker status={routing.status} isReturn={routing.isReturn} />
            {index < routings.length - 1 && <span className="bg-border w-px flex-1" />}
          </div>

          <div className={cn("min-w-0 flex-1", index < routings.length - 1 && "pb-5")}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">{routing.stepName}</span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-muted-foreground text-sm">{routing.assignedTo}</span>

              {routing.isReturn && (
                <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-500">
                  Returned here
                </span>
              )}

              {routing.priority >= Priority.High && routing.status === RoutingStatus.Pending && (
                <span className="border-destructive/40 text-destructive rounded border px-1.5 py-0.5 text-xs">
                  {priorityLabel[routing.priority]}
                </span>
              )}
            </div>

            <p className="text-muted-foreground mt-0.5 text-xs">
              {routing.department}
              {routing.routedBy && ` · routed by ${routing.routedBy}`}
              {" · "}
              {new Date(routing.routedAt).toLocaleString()}
            </p>

            {/* The instruction sent with the routing, and the reason recorded when acting —
                for a rejection the second is what the recipient has to act on. */}
            {routing.note && (
              <p className="mt-1.5 text-sm">
                <span className="text-muted-foreground">Note: </span>
                {routing.note}
              </p>
            )}

            {routing.decision && (
              <p
                className={cn(
                  "mt-1.5 text-sm",
                  routing.status === RoutingStatus.Rejected && "text-destructive",
                )}
              >
                <span className="text-muted-foreground">
                  {routing.status === RoutingStatus.Rejected ? "Returned: " : "Decision: "}
                </span>
                {routing.decision}
              </p>
            )}

            {routing.status === RoutingStatus.Pending && routing.dueDate && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  new Date(routing.dueDate) < new Date()
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                Due {new Date(routing.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StatusMarker({ status, isReturn }: { status: RoutingStatus; isReturn: boolean }) {
  const base = "grid size-7 shrink-0 place-items-center rounded-full border";

  if (status === RoutingStatus.Approved) {
    return (
      <span className={cn(base, "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-500")}>
        <Check className="size-3.5" aria-label="Approved" />
      </span>
    );
  }

  if (status === RoutingStatus.Rejected) {
    return (
      <span className={cn(base, "border-destructive/30 bg-destructive/10 text-destructive")}>
        <X className="size-3.5" aria-label="Returned" />
      </span>
    );
  }

  if (status === RoutingStatus.Reviewed) {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Eye className="size-3.5" aria-label="Reviewed" />
      </span>
    );
  }

  // Withdrawn: the step closed before this assignee acted, so it is shown faded rather
  // than hidden — the trail is a record, not a summary.
  if (status === RoutingStatus.Withdrawn) {
    return (
      <span className={cn(base, "text-muted-foreground/50 border-dashed")}>
        <X className="size-3.5" aria-label="Withdrawn" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        base,
        isReturn
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500"
          : "border-foreground/20 text-foreground",
      )}
    >
      {isReturn ? (
        <CornerUpLeft className="size-3.5" aria-label="Returned, awaiting action" />
      ) : (
        <Clock className="size-3.5" aria-label="Awaiting action" />
      )}
    </span>
  );
}
