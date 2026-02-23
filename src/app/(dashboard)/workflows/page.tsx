"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    FileText, GitMerge, Clock, CheckCircle2, XCircle,
    Folder, ArrowRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { WorkflowRoutingForm, type RoutingPayload } from "@/components/workflow/workflow-routing-form";
import { createRoutingEntry, type RoutingEntry } from "@/lib/workflow-mock";
import { appendAuditLog, getMockCurrentUser } from "@/lib/audit-mock";
import { useCan } from "@/contexts/current-user-context";
import { PERMISSIONS } from "@/lib/permissions-mock";

type Stage = "submitted" | "gatekeeper" | "department" | "completed";

interface WorkflowDoc {
    id: string;
    title: string;
    type: string;
    submittedBy: { name: string; initials: string };
    date: string;
    status: string;
    stage: Stage;
    priority: "low" | "normal" | "high";
    routingHistory?: RoutingEntry[];
}

const mockDocs: WorkflowDoc[] = [
    { id: "DOC-005", title: "Annual Leave Policy", type: "Policy", submittedBy: { name: "Ada Mensah", initials: "AM" }, date: "Oct 25, 2024", status: "Pending", stage: "submitted", priority: "normal", routingHistory: [] },
    { id: "DOC-006", title: "IT Security Report", type: "Report", submittedBy: { name: "Kwame Asante", initials: "KA" }, date: "Oct 24, 2024", status: "Pending", stage: "submitted", priority: "high", routingHistory: [] },
    { id: "DOC-001", title: "Q3 Financial Report", type: "Report", submittedBy: { name: "John Doe", initials: "JD" }, date: "Oct 24, 2024", status: "Pending", stage: "gatekeeper", priority: "high", routingHistory: [] },
    { id: "DOC-007", title: "Vendor Agreement", type: "Contract", submittedBy: { name: "Ama Boateng", initials: "AB" }, date: "Oct 23, 2024", status: "Pending", stage: "gatekeeper", priority: "normal", routingHistory: [] },
    { id: "DOC-002", title: "Project Alpha Plan", type: "Memo", submittedBy: { name: "Sarah Smith", initials: "SS" }, date: "Oct 23, 2024", status: "Pending", stage: "department", priority: "normal", routingHistory: [{ departmentId: "finance", departmentName: "Finance", userId: "u1", userName: "John Doe", priority: "normal", routedAt: "2024-10-23T10:00:00Z" }] },
    { id: "DOC-008", title: "HR Benefits Update", type: "Policy", submittedBy: { name: "Dave Ofori", initials: "DO" }, date: "Oct 22, 2024", status: "Pending", stage: "department", priority: "low", routingHistory: [{ departmentId: "hr", departmentName: "Human Resources", userId: "u5", userName: "Sarah Wilson", priority: "low", routedAt: "2024-10-22T14:00:00Z" }] },
    { id: "DOC-003", title: "Invoice #4521", type: "Invoice", submittedBy: { name: "Mike Jones", initials: "MJ" }, date: "Oct 22, 2024", status: "Approved", stage: "completed", priority: "normal", routingHistory: [] },
    { id: "DOC-004", title: "Client Contract v2", type: "Contract", submittedBy: { name: "Emily Blunt", initials: "EB" }, date: "Oct 21, 2024", status: "Rejected", stage: "completed", priority: "low", routingHistory: [] },
];

const columns: { stage: Stage; label: string; icon: React.ReactNode; color: string; headerColor: string }[] = [
    { stage: "submitted", label: "Submitted", icon: <FileText className="h-4 w-4" />, color: "border-slate-200", headerColor: "bg-slate-100 text-slate-600" },
    { stage: "gatekeeper", label: "Gatekeeper Review", icon: <Clock className="h-4 w-4" />, color: "border-blue-200", headerColor: "bg-blue-50 text-blue-700" },
    { stage: "department", label: "Department Review", icon: <GitMerge className="h-4 w-4" />, color: "border-amber-200", headerColor: "bg-amber-50 text-amber-700" },
    { stage: "completed", label: "Completed", icon: <CheckCircle2 className="h-4 w-4" />, color: "border-green-200", headerColor: "bg-green-50 text-green-700" },
];

const priorityBadge: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    normal: "bg-blue-100 text-blue-700",
    low: "bg-slate-100 text-slate-600",
};

const statusBadge: Record<string, string> = {
    Pending: "bg-amber-100 text-amber-700",
    Approved: "bg-green-100 text-green-700",
    Rejected: "bg-red-100 text-red-700",
};

export default function WorkflowsPage() {
    const router = useRouter();
    const [docs, setDocs] = useState<WorkflowDoc[]>(mockDocs);
    const [routeDoc, setRouteDoc] = useState<WorkflowDoc | null>(null);
    const canRoute = useCan(PERMISSIONS.ROUTE_DOCS);
    const canApprove = useCan(PERMISSIONS.APPROVE_DOCS);

    const stageOrder: Stage[] = ["submitted", "gatekeeper", "department", "completed"];

    const advance = (docId: string) => {
        const doc = docs.find(d => d.id === docId);
        if (doc) {
            const { userId, userName } = getMockCurrentUser();
            appendAuditLog({ action: "Document stage advanced", entityType: "workflow", entityId: docId, userId, userName, details: doc.title });
        }
        setDocs(prev => prev.map(d => {
            if (d.id !== docId) return d;
            const idx = stageOrder.indexOf(d.stage);
            const next = stageOrder[Math.min(idx + 1, stageOrder.length - 1)];
            return { ...d, stage: next };
        }));
    };

    const handleRouteSuccess = (docId: string, payload: RoutingPayload) => {
        const doc = docs.find(d => d.id === docId);
        if (doc) {
            const { userId, userName } = getMockCurrentUser();
            appendAuditLog({ action: "Document routed", entityType: "workflow", entityId: docId, userId, userName, details: `${doc.title} → ${payload.departmentName}` });
        }
        const entry = createRoutingEntry(payload);
        setDocs(prev => prev.map(d => {
            if (d.id !== docId) return d;
            const history = [...(d.routingHistory ?? []), entry];
            return { ...d, routingHistory: history, stage: "department" as Stage };
        }));
        setRouteDoc(null);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Workflow Board</h1>
                <p className="text-slate-500 mt-1 text-sm">Track documents through the review pipeline.</p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {columns.map(col => {
                    const count = docs.filter(d => d.stage === col.stage).length;
                    return (
                        <div key={col.stage} className={`bg-white rounded-xl border ${col.color} p-3 shadow-sm flex items-center gap-3`}>
                            <div className={`p-2 rounded-lg ${col.headerColor}`}>{col.icon}</div>
                            <div>
                                <p className="text-xs text-slate-500">{col.label}</p>
                                <p className="text-xl font-bold text-slate-800">{count}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Kanban board */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
                {columns.map(col => {
                    const colDocs = docs.filter(d => d.stage === col.stage);
                    return (
                        <div key={col.stage} className={`bg-white rounded-xl border ${col.color} shadow-sm overflow-hidden`}>
                            {/* Column header */}
                            <div className={`px-4 py-3 flex items-center gap-2 ${col.headerColor} border-b`}>
                                {col.icon}
                                <span className="text-sm font-semibold">{col.label}</span>
                                <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/70">
                                    {colDocs.length}
                                </span>
                            </div>

                            {/* Cards */}
                            <div className="p-3 space-y-3 min-h-[120px]">
                                {colDocs.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-6 text-slate-300">
                                        <Folder className="h-6 w-6 mb-1" />
                                        <p className="text-xs">Empty</p>
                                    </div>
                                )}
                                {colDocs.map(doc => (
                                    <div
                                        key={doc.id}
                                        className="bg-slate-50 rounded-lg border border-slate-100 p-3 hover:shadow-md transition-shadow cursor-pointer"
                                        onClick={() => router.push(`/inbox/${doc.id}`)}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <p className="text-sm font-medium text-slate-800 line-clamp-2">{doc.title}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{doc.type}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityBadge[doc.priority]}`}>
                                                {doc.priority.charAt(0).toUpperCase() + doc.priority.slice(1)}
                                            </span>
                                            {col.stage === "department" && doc.routingHistory?.length && (
                                                <span className="text-[10px] text-slate-500">
                                                    Assigned to: {doc.routingHistory[doc.routingHistory.length - 1].userName}
                                                </span>
                                            )}
                                            {col.stage === "completed" && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge[doc.status]}`}>
                                                    {doc.status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <Avatar className="h-5 w-5">
                                                    <AvatarFallback className="text-[9px] bg-blue-100 text-blue-700">{doc.submittedBy.initials}</AvatarFallback>
                                                </Avatar>
                                                <span className="text-[10px] text-slate-500">{doc.submittedBy.name}</span>
                                            </div>
                                            {col.stage !== "completed" && (canRoute || canApprove) && (
                                                <div className="flex gap-1">
                                                    {canRoute && (col.stage === "gatekeeper" || col.stage === "department") && (
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-6 w-6 text-blue-600 hover:bg-blue-50"
                                                            title={col.stage === "department" ? "Route to another department" : "Route to Department"}
                                                            onClick={e => { e.stopPropagation(); setRouteDoc(doc); }}
                                                        >
                                                            <GitMerge className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                    {canApprove && (
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-6 w-6 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                                        title="Advance Stage"
                                                        onClick={e => { e.stopPropagation(); advance(doc.id); }}
                                                    >
                                                        <ArrowRight className="h-3.5 w-3.5" />
                                                    </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Route Dialog */}
            <Dialog open={!!routeDoc} onOpenChange={open => { if (!open) setRouteDoc(null); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Route Document</DialogTitle>
                        <DialogDescription>
                            Forward "{routeDoc?.title}" to a department for review.
                        </DialogDescription>
                    </DialogHeader>
                    <WorkflowRoutingForm
                        documentId={routeDoc?.id}
                        onSuccess={(payload) => {
                            if (routeDoc && payload) handleRouteSuccess(routeDoc.id, payload);
                            else if (routeDoc) { advance(routeDoc.id); setRouteDoc(null); }
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
