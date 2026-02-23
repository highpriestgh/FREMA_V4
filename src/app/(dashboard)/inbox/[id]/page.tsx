"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, CheckCircle2, XCircle, GitMerge,
    FileText, Calendar, Tag, MapPin, User, AlertTriangle, MessageSquare, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { WorkflowStepper, type WorkflowStage } from "@/components/workflow/workflow-stepper";
import { WorkflowRoutingForm, type RoutingPayload } from "@/components/workflow/workflow-routing-form";
import { CommentThread } from "@/components/review/comment-thread";
import { createRoutingEntry, type RoutingEntry } from "@/lib/workflow-mock";
import { appendAuditLog, getMockCurrentUser } from "@/lib/audit-mock";
import { useCan } from "@/contexts/current-user-context";
import { PERMISSIONS } from "@/lib/permissions-mock";
import {
    getAnnotations,
    addAnnotation,
    getSharedSession,
    joinSharedSession,
    type Annotation as AnnotationType,
} from "@/lib/annotations-mock";
import { Input } from "@/components/ui/input";

// Mock document store — keyed by ID
const mockDocuments: Record<string, {
    id: string;
    title: string;
    refNumber: string;
    type: string;
    origin: string;
    submittedBy: { name: string; initials: string; role: string };
    date: string;
    status: string;
    stage: WorkflowStage;
    routingHistory?: RoutingEntry[];
}> = {
    "DOC-001": {
        id: "DOC-001", title: "Q3 Financial Report", refNumber: "REF-2024-Q3-F",
        type: "Report", origin: "Accra HQ",
        submittedBy: { name: "John Doe", initials: "JD", role: "Record Officer" },
        date: "Oct 24, 2024", status: "Pending", stage: "gatekeeper",
        routingHistory: [],
    },
    "DOC-002": {
        id: "DOC-002", title: "Project Alpha Plan", refNumber: "REF-2024-PA-01",
        type: "Memo", origin: "Kumasi Branch",
        submittedBy: { name: "Sarah Smith", initials: "SS", role: "Project Lead" },
        date: "Oct 23, 2024", status: "Pending", stage: "department",
        routingHistory: [{ departmentId: "finance", departmentName: "Finance", userId: "u1", userName: "John Doe", priority: "normal", routedAt: "2024-10-23T10:00:00Z" }],
    },
    "DOC-003": {
        id: "DOC-003", title: "Invoice #4521", refNumber: "REF-2024-INV-4521",
        type: "Invoice", origin: "External Source",
        submittedBy: { name: "Mike Jones", initials: "MJ", role: "Finance Officer" },
        date: "Oct 22, 2024", status: "Approved", stage: "completed",
        routingHistory: [],
    },
    "DOC-004": {
        id: "DOC-004", title: "Client Contract v2", refNumber: "REF-2024-CC-002",
        type: "Contract", origin: "Accra HQ",
        submittedBy: { name: "Emily Blunt", initials: "EB", role: "Legal Officer" },
        date: "Oct 21, 2024", status: "Rejected", stage: "completed",
        routingHistory: [],
    },
};

const statusStyleMap: Record<string, string> = {
    Pending: "bg-amber-500 text-white",
    Approved: "bg-green-500 text-white",
    Rejected: "bg-red-500 text-white",
};

export default function DocumentReviewPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;

    const [doc, setDoc] = useState(mockDocuments[id]);
    const [routeOpen, setRouteOpen] = useState(false);
    const [annotations, setAnnotations] = useState<AnnotationType[]>(() => (id ? getAnnotations(id) : []));
    const [newAnnotationText, setNewAnnotationText] = useState("");
    const sharedSession = id ? getSharedSession(id) : { documentId: id ?? "", isActive: false, participants: [] };

    useEffect(() => {
        if (id && doc) {
            const { userId, userName } = getMockCurrentUser();
            appendAuditLog({ action: "Document viewed", entityType: "document", entityId: id, userId, userName, details: doc.title });
        }
    }, [id, doc?.id]);

    useEffect(() => {
        if (id) setAnnotations(getAnnotations(id));
    }, [id]);

    if (!doc) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-24 text-slate-500">
                <AlertTriangle className="h-10 w-10 mb-4 text-amber-400" />
                <p className="text-lg font-medium">Document not found</p>
                <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Inbox
                </Button>
            </div>
        );
    }

    const handleApprove = () => {
        const { userId, userName } = getMockCurrentUser();
        appendAuditLog({ action: "Document approved", entityType: "document", entityId: doc.id, userId, userName, details: doc.title });
        setDoc(d => ({ ...d, status: "Approved", stage: "completed" }));
    };

    const handleReject = () => {
        const { userId, userName } = getMockCurrentUser();
        appendAuditLog({ action: "Document rejected", entityType: "document", entityId: doc.id, userId, userName, details: doc.title });
        setDoc(d => ({ ...d, status: "Rejected", stage: "completed" }));
    };

    const isPending = doc.status === "Pending";
    const canApprove = useCan(PERMISSIONS.APPROVE_DOCS);
    const canRoute = useCan(PERMISSIONS.ROUTE_DOCS);

    function handleAddAnnotation() {
        const text = newAnnotationText.trim();
        if (!text || !id) return;
        const { userId, userName } = getMockCurrentUser();
        addAnnotation(id, { authorId: userId, authorName: userName, text });
        setAnnotations(getAnnotations(id));
        setNewAnnotationText("");
    }

    return (
        <div className="space-y-6">
            {/* Shared viewing banner */}
            <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <Users className="h-4 w-4 text-slate-500" />
                {sharedSession.isActive && sharedSession.participants.length > 0 ? (
                    <span>
                        Shared viewing: {sharedSession.participants.map((p) => p.userName).join(", ")}
                    </span>
                ) : (
                    <span>Shared viewing: Not active</span>
                )}
            </div>

            {/* Top bar */}
            <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-slate-500">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Inbox
                </Button>
                <Badge className={statusStyleMap[doc.status] ?? "bg-slate-500 text-white"}>
                    {doc.status}
                </Badge>
            </div>

            {/* Main two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

                {/* LEFT — Document Preview */}
                <div className="lg:col-span-3 bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="bg-slate-50 border-b px-4 py-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-slate-700">{doc.title}</span>
                        <span className="ml-auto text-xs text-slate-400">{doc.refNumber}</span>
                    </div>
                    {/* Preview placeholder */}
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-slate-50/50 min-h-[420px]">
                        <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col items-center gap-3">
                            <FileText className="h-16 w-16 text-blue-200" />
                            <p className="text-sm font-medium text-slate-600">Document Preview</p>
                            <p className="text-xs text-slate-400 text-center max-w-[200px]">
                                PDF viewer will be embedded here when backend is connected.
                            </p>
                            <Button variant="outline" size="sm" className="mt-2">
                                Download File
                            </Button>
                        </div>
                    </div>
                </div>

                {/* RIGHT — Metadata, Workflow, Comments, Actions */}
                <div className="lg:col-span-2 space-y-4">

                    {/* Metadata Card */}
                    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                        <h2 className="text-sm font-semibold text-slate-700">Document Details</h2>
                        <Separator />
                        <div className="space-y-2.5 text-sm">
                            <div className="flex items-start gap-2 text-slate-600">
                                <Tag className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-400">Type</p>
                                    <p className="font-medium">{doc.type}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2 text-slate-600">
                                <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-400">Origin</p>
                                    <p className="font-medium">{doc.origin}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2 text-slate-600">
                                <User className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-400">Submitted By</p>
                                    <p className="font-medium">{doc.submittedBy.name}</p>
                                    <p className="text-xs text-slate-400">{doc.submittedBy.role}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2 text-slate-600">
                                <Calendar className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-400">Submitted On</p>
                                    <p className="font-medium">{doc.date}</p>
                                </div>
                            </div>
                            {doc.routingHistory && doc.routingHistory.length > 0 && (
                                <div className="flex items-start gap-2 text-slate-600">
                                    <User className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs text-slate-400">Current assignee</p>
                                        <p className="font-medium">
                                            {doc.routingHistory[doc.routingHistory.length - 1].departmentName} – {doc.routingHistory[doc.routingHistory.length - 1].userName}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Routing history (optional) */}
                    {doc.routingHistory && doc.routingHistory.length > 0 && (
                        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                            <h2 className="text-sm font-semibold text-slate-700">Routing History</h2>
                            <Separator />
                            <ul className="space-y-2 text-sm">
                                {doc.routingHistory.map((entry, i) => (
                                    <li key={i} className="flex items-center justify-between text-slate-600">
                                        <span>{entry.departmentName} → {entry.userName}</span>
                                        {entry.routedAt && (
                                            <span className="text-xs text-slate-400">
                                                {new Date(entry.routedAt).toLocaleDateString()}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Workflow Stepper */}
                    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                        <h2 className="text-sm font-semibold text-slate-700">Workflow Status</h2>
                        <Separator />
                        <WorkflowStepper currentStage={doc.stage} />
                    </div>

                    {/* Comment Thread */}
                    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                        <h2 className="text-sm font-semibold text-slate-700">Comments</h2>
                        <Separator />
                        <CommentThread documentId={doc.id} />
                    </div>

                    {/* Annotations */}
                    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" /> Annotations
                        </h2>
                        <Separator />
                        <ul className="space-y-2 text-sm">
                            {annotations.map((ann) => (
                                <li key={ann.id} className="rounded-md bg-slate-50 p-2 border border-slate-100">
                                    <p className="text-slate-800">{ann.text}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {ann.authorName} • {new Date(ann.createdAt).toLocaleString()}
                                        {ann.pageRef != null && ` • Page ${ann.pageRef}`}
                                    </p>
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Add annotation..."
                                value={newAnnotationText}
                                onChange={(e) => setNewAnnotationText(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddAnnotation()}
                            />
                            <Button type="button" size="sm" onClick={handleAddAnnotation} disabled={!newAnnotationText.trim()}>
                                Add
                            </Button>
                        </div>
                    </div>

                    {/* Action Bar */}
                    {isPending && (canApprove || canRoute) && (
                        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                            <h2 className="text-sm font-semibold text-slate-700">Actions</h2>
                            <Separator />
                            <div className="flex flex-col gap-2">
                                {/* Approve */}
                                {canApprove && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button className="w-full bg-green-600 hover:bg-green-700">
                                            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve Document
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Approve Document?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will mark "{doc.title}" as approved and complete the review process.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                className="bg-green-600 hover:bg-green-700"
                                                onClick={handleApprove}
                                            >
                                                Yes, Approve
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                )}

                                {/* Reject */}
                                {canApprove && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50">
                                            <XCircle className="mr-2 h-4 w-4" /> Reject Document
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Reject Document?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will mark "{doc.title}" as rejected. The submitter will be notified.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                className="bg-red-600 hover:bg-red-700"
                                                onClick={handleReject}
                                            >
                                                Yes, Reject
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                )}

                                {/* Route (Gatekeeper or Department — route to another department) */}
                                {canRoute && (doc.stage === "gatekeeper" || doc.stage === "department") && (
                                    <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" className="w-full">
                                                <GitMerge className="mr-2 h-4 w-4" />
                                                {doc.stage === "department" ? "Route to another department" : "Route to Department"}
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-sm">
                                            <DialogHeader>
                                                <DialogTitle>Route Document</DialogTitle>
                                                <DialogDescription>
                                                    Forward this document to a department and assign a recipient.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <WorkflowRoutingForm
                                                documentId={doc.id}
                                                onSuccess={(payload) => {
                                                    setRouteOpen(false);
                                                    if (payload) {
                                                        const { userId, userName } = getMockCurrentUser();
                                                        appendAuditLog({ action: "Document routed", entityType: "workflow", entityId: doc.id, userId, userName, details: `${doc.title} → ${payload.departmentName}` });
                                                        const entry = createRoutingEntry(payload);
                                                        setDoc(d => ({
                                                            ...d,
                                                            routingHistory: [...(d.routingHistory ?? []), entry],
                                                            stage: "department",
                                                        }));
                                                    }
                                                }}
                                            />
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
