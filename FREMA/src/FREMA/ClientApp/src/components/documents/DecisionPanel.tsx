import { useState } from "react";
import { Check, CornerUpLeft, Eye, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { WorkflowDecision, type DocumentDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RecipientPicker } from "./RecipientPicker";

/**
 * Acting on the current step.
 *
 * Approving and choosing where the document goes next are one action, not two — a step that
 * picks its recipients at routing time needs them supplied with the decision, or the
 * document would advance into a step with nobody assigned and stop dead.
 */
export function DecisionPanel({
  document,
  onDone,
  returnedBecause,
}: {
  document: DocumentDetail;
  onDone: () => void;
  /** The reason this came back, when the assignment awaiting the user is a return. */
  returnedBecause?: string | null;
}) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const needsRecipients = document.nextStep?.requiresRecipientChoice ?? false;
  const isReturned = Boolean(returnedBecause);

  async function decide(decision: WorkflowDecision) {
    // Checked here so the user is told before the round-trip; the server enforces both
    // rules regardless.
    if (decision === WorkflowDecision.Reject && !comment.trim()) {
      toast.error("A reason is required", "Say what needs changing before returning it.");
      return;
    }

    if (decision === WorkflowDecision.Approve && needsRecipients && recipients.length === 0) {
      toast.error(
        `Choose who receives "${document.nextStep?.name}"`,
        "Approving moves the document to the next step, which needs a recipient.",
      );
      return;
    }

    setBusy(true);
    try {
      await api.post(`/api/documents/${document.id}/decision`, {
        decision,
        comment: comment.trim() || null,
        nextAssignees: decision === WorkflowDecision.Approve ? recipients : null,
      });

      // Matches the wording on the button the user pressed — "Approved" after pressing
      // "Send on again" reads as though something else happened.
      toast.success(
        decision === WorkflowDecision.Reject
          ? "Returned to sender"
          : decision === WorkflowDecision.Review
            ? "Marked as reviewed"
            : isReturned
              ? "Sent on again"
              : "Approved",
      );

      setComment("");
      setRecipients([]);
      onDone();
    } catch (error) {
      toast.fromError(error, "Could not record your decision");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isReturned ? "Returned to you" : `Your decision — ${document.currentStep}`}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* The reason it came back is the first thing the user needs; repeating it here
            saves them hunting for it in the trail below. */}
        {isReturned && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-500">
              Sent back for changes
            </p>
            <p className="mt-0.5">{returnedBecause}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="decision-comment">
            Comment
            <span className="text-muted-foreground font-normal"> (required to return)</span>
          </Label>
          <Textarea
            id="decision-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add context, or say what needs changing…"
            rows={3}
          />
        </div>

        {needsRecipients && (
          <div className="space-y-2">
            <Label>Send to — {document.nextStep?.name}</Label>
            <RecipientPicker
              departmentId={document.nextStep?.departmentId ?? null}
              selected={recipients}
              onChange={setRecipients}
            />
            <p className="text-muted-foreground text-xs">
              Choosing more than one person sends it to all of them.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void decide(WorkflowDecision.Approve)}>
            <Check className="size-4" aria-hidden />
            {isReturned
              ? "Send on again"
              : document.nextStep
                ? "Approve and send on"
                : "Approve and close"}
          </Button>

          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void decide(WorkflowDecision.Reject)}
          >
            <CornerUpLeft className="size-4" aria-hidden />
            Return to sender
          </Button>

          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void decide(WorkflowDecision.Review)}
          >
            <Eye className="size-4" aria-hidden />
            Mark reviewed
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Starts a draft, or re-submits one that came back. */
export function SubmitPanel({
  document,
  onDone,
}: {
  document: DocumentDetail;
  onDone: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/api/documents/${document.id}/submit`, {
        assignees: recipients.length > 0 ? recipients : null,
        note: note.trim() || null,
      });

      toast.success("Submitted", "The document is now with its first reviewer.");
      onDone();
    } catch (error) {
      // Covers the case where the first step needs a recipient and none was chosen: the
      // server names the step in its message, so the user is told exactly what is missing.
      toast.fromError(error, "Could not submit this document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {document.status === 2 ? "Re-submit" : "Submit for approval"}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Send to</Label>
          <RecipientPicker departmentId={null} selected={recipients} onChange={setRecipients} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="submit-note">Note</Label>
          <Textarea
            id="submit-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What are you asking them to do?"
            rows={2}
          />
        </div>

        <Button disabled={busy} onClick={() => void submit()}>
          <Send className="size-4" aria-hidden />
          Submit
        </Button>
      </CardContent>
    </Card>
  );
}
