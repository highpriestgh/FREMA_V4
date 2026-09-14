import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/auth/AuthContext";
import { Permission, type Comment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CommentThread({
  documentId,
  comments,
  onAdded,
}: {
  documentId: string;
  comments: Comment[];
  onAdded: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!text.trim()) return;

    setBusy(true);
    try {
      await api.post(`/api/documents/${documentId}/comments`, { text: text.trim() });
      setText("");
      onAdded();
    } catch (error) {
      toast.fromError(error, "Could not post your comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 && (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      )}

      <ol className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{comment.author}</span>
              <time className="text-muted-foreground text-xs">
                {new Date(comment.createdAt).toLocaleString()}
              </time>
              {comment.editedAt && (
                <span className="text-muted-foreground text-xs">(edited)</span>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap">{comment.text}</p>
          </li>
        ))}
      </ol>

      {/* The same permission gates the endpoint, so hiding the box is presentation only. */}
      {can(Permission.CommentOnDocuments) && (
        <div className="space-y-2 border-t pt-4">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Add a comment…"
            rows={2}
            aria-label="Add a comment"
          />
          <Button size="sm" disabled={busy || !text.trim()} onClick={() => void add()}>
            Comment
          </Button>
        </div>
      )}
    </div>
  );
}
