import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/lib/api";
import {
  DocumentStatus, documentStatusLabel, RoutingStatus,
  type DocumentDetail,
} from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowTrail } from "@/components/documents/WorkflowTrail";
import { DecisionPanel, SubmitPanel } from "@/components/documents/DecisionPanel";
import { CommentThread } from "@/components/documents/CommentThread";
import { FilePanel } from "@/components/documents/FilePanel";
import { statusVariant } from "./DocumentsPage";

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { data, loading, error, reload } = useApi<DocumentDetail>(
    id ? `/api/documents/${id}` : null,
  );

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (error) {
    // A 403 here is a real answer, not a malfunction: the caller may not see this document.
    const forbidden = error instanceof ApiError && error.isForbidden;

    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="p-10 text-center">
          <p className="font-medium">
            {forbidden ? "You do not have access to this document" : "Could not load this document"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {error instanceof ApiError ? error.message : "Please try again."}
          </p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const isOwner = data.uploadedById === profile?.id;

  // Whether *this* user is the one the current step is waiting on. Holding the approve
  // permission is not enough, and the server applies the same test.
  const myPendingRouting = data.routings.find(
    (r) =>
      r.status === RoutingStatus.Pending &&
      r.assignedToId === profile?.id &&
      r.stepName === data.currentStep,
  );

  const awaitingMe = Boolean(myPendingRouting);

  // Submitting and deciding must never be offered together. A returned document that came
  // back with a live assignment is *resumed* by acting on that assignment, which carries it
  // forward to the reviewer who asked for the change. Calling submit instead would restart
  // the route from step one and discard every approval already given.
  //
  // The exception is a document returned from the very first step: there is no earlier step
  // to hold an assignment, so it sits with its owner and submitting is the only way on.
  const canSubmit =
    isOwner &&
    !awaitingMe &&
    (data.status === DocumentStatus.Draft || data.status === DocumentStatus.Returned);

  const canEditFile =
    isOwner && (data.status === DocumentStatus.Draft || data.status === DocumentStatus.Returned);

  return (
    <div className="space-y-6">
      <BackLink />

      <PageHeader
        title={data.title}
        description={data.summary ?? undefined}
        actions={<Badge variant={statusVariant(data.status)}>{documentStatusLabel[data.status]}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {awaitingMe && (
            <DecisionPanel
              document={data}
              onDone={reload}
              returnedBecause={myPendingRouting?.isReturn ? myPendingRouting.note : null}
            />
          )}
          {canSubmit && <SubmitPanel document={data} onDone={reload} />}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Workflow
                {data.workflowName && (
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {data.workflowName}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowTrail routings={data.routings} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comments</CardTitle>
            </CardHeader>
            <CardContent>
              <CommentThread documentId={data.id} comments={data.comments} onAdded={reload} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">File</CardTitle>
            </CardHeader>
            <CardContent>
              <FilePanel document={data} canEdit={canEditFile} onChanged={reload} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Detail label="Number" value={data.number} mono />
              <Detail label="Type" value={data.documentType} />
              <Detail label="Origin" value={data.origin} />
              <Detail label="Raised by" value={data.uploadedBy} />
              <Detail label="Created" value={new Date(data.createdAt).toLocaleString()} />
              {data.closedAt && (
                <Detail label="Closed" value={new Date(data.closedAt).toLocaleString()} />
              )}
              {data.currentStep && <Detail label="Current step" value={data.currentStep} />}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/documents">
        <ArrowLeft className="size-4" aria-hidden />
        All documents
      </Link>
    </Button>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={mono ? "truncate font-mono text-xs" : "truncate text-right"}>
        {value ?? "—"}
      </span>
    </div>
  );
}
