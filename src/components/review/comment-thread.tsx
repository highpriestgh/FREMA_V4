"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { appendAuditLog, getMockCurrentUser } from "@/lib/audit-mock";

interface Comment {
    id: string;
    author: string;
    initials: string;
    timestamp: string;
    text: string;
    role: string;
}

const initialComments: Comment[] = [
    {
        id: "c1",
        author: "Jane Cooper",
        initials: "JC",
        role: "Gatekeeper",
        timestamp: "Oct 24, 2024 · 09:15 AM",
        text: "Received and screened. All mandatory fields are present. Forwarding to Finance department for departmental review.",
    },
    {
        id: "c2",
        author: "Robert Fox",
        initials: "RF",
        role: "Finance Manager",
        timestamp: "Oct 24, 2024 · 11:42 AM",
        text: "Under review. Some line items need clarification from the originating department. I will follow up.",
    },
];

interface CommentThreadProps {
    documentId: string;
}

export function CommentThread({ documentId }: CommentThreadProps) {
    const [comments, setComments] = useState<Comment[]>(initialComments);
    const [newComment, setNewComment] = useState("");

    const handleSubmit = () => {
        if (!newComment.trim()) return;
        const comment: Comment = {
            id: `c${Date.now()}`,
            author: "You (John Doe)",
            initials: "JD",
            role: "Record Officer",
            timestamp: new Date().toLocaleString("en-US", {
                month: "short", day: "numeric", year: "numeric",
                hour: "2-digit", minute: "2-digit",
            }),
            text: newComment.trim(),
        };
        setComments(prev => [...prev, comment]);
        const { userId, userName } = getMockCurrentUser();
        appendAuditLog({ action: "Comment added", entityType: "comment", entityId: documentId, userId, userName, details: newComment.trim().slice(0, 80) });
        setNewComment("");
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Comment list */}
            <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                {comments.map(comment => (
                    <div key={comment.id} className="flex gap-3">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700 font-semibold">
                                {comment.initials}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 bg-slate-50 rounded-lg px-3 py-2 border">
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <div>
                                    <span className="text-xs font-semibold text-slate-800">{comment.author}</span>
                                    <span className="ml-2 text-[10px] text-slate-400 bg-slate-100 rounded px-1 py-0.5">{comment.role}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">{comment.timestamp}</span>
                            </div>
                            <p className="text-sm text-slate-600">{comment.text}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* New comment input */}
            <div className="flex gap-2 items-start">
                <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="text-[10px] bg-blue-600 text-white font-semibold">JD</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                    <Textarea
                        placeholder="Add a comment..."
                        className="resize-none text-sm"
                        rows={2}
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
                        }}
                    />
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={handleSubmit}
                        disabled={!newComment.trim()}
                    >
                        <Send className="h-3 w-3 mr-2" />
                        Comment
                    </Button>
                </div>
            </div>
        </div>
    );
}
