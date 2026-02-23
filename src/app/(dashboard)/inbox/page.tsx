"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger
} from "@/components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Eye, FileText, Calendar, GitMerge } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { WorkflowRoutingForm, type RoutingPayload } from "@/components/workflow/workflow-routing-form";
import { createRoutingEntry, type RoutingEntry } from "@/lib/workflow-mock";
import { appendAuditLog, getMockCurrentUser } from "@/lib/audit-mock";
import { useCan } from "@/contexts/current-user-context";
import { PERMISSIONS } from "@/lib/permissions-mock";

type Stage = "gatekeeper" | "department" | "completed";

type InboxDoc = {
    id: string;
    title: string;
    submittedBy: { name: string; initials: string };
    date: string;
    status: string;
    type: string;
    stage: Stage;
    routingHistory?: RoutingEntry[];
};

// Mock Data
const initialDocuments: InboxDoc[] = [
    {
        id: "DOC-001",
        title: "Q3 Financial Report",
        submittedBy: { name: "John Doe", initials: "JD" },
        date: "2024-10-24",
        status: "Pending",
        type: "Report",
        stage: "gatekeeper" as Stage,
        routingHistory: [],
    },
    {
        id: "DOC-002",
        title: "Project Alpha Plan",
        submittedBy: { name: "Sarah Smith", initials: "SS" },
        date: "2024-10-23",
        status: "Pending",
        type: "Memo",
        stage: "department" as Stage,
        routingHistory: [{ departmentId: "finance", departmentName: "Finance", userId: "u1", userName: "John Doe", priority: "normal", routedAt: "2024-10-23T10:00:00Z" }],
    },
    {
        id: "DOC-003",
        title: "Invoice #4521",
        submittedBy: { name: "Mike Jones", initials: "MJ" },
        date: "2024-10-22",
        status: "Approved",
        type: "Invoice",
        stage: "completed" as Stage,
        routingHistory: [],
    },
    {
        id: "DOC-004",
        title: "Client Contract v2",
        submittedBy: { name: "Emily Blunt", initials: "EB" },
        date: "2024-10-21",
        status: "Rejected",
        type: "Contract",
        stage: "completed" as Stage,
        routingHistory: [],
    },
];

export default function InboxPage() {
    return (
        <Suspense fallback={<div className="p-8 text-slate-500">Loading inbox…</div>}>
            <InboxPageContent />
        </Suspense>
    );
}

function InboxPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [documents, setDocuments] = useState(initialDocuments);
    const [routeDocId, setRouteDocId] = useState<string | null>(null);
    const [routeOpen, setRouteOpen] = useState(false);

    const tabParam = searchParams.get("tab");
    const validTabs = ["Pending", "Approved", "Rejected", "All"];
    const defaultTab = tabParam && validTabs.includes(tabParam) ? tabParam : "Pending";

    const canApprove = useCan(PERMISSIONS.APPROVE_DOCS);
    const canRoute = useCan(PERMISSIONS.ROUTE_DOCS);

    const handleApprove = (id: string) => {
        const doc = documents.find(d => d.id === id);
        if (doc) {
            const { userId, userName } = getMockCurrentUser();
            appendAuditLog({ action: "Document approved", entityType: "document", entityId: id, userId, userName, details: doc.title });
        }
        setDocuments(docs => docs.map(d => d.id === id ? { ...d, status: "Approved" } : d));
    };

    const handleReject = (id: string) => {
        const doc = documents.find(d => d.id === id);
        if (doc) {
            const { userId, userName } = getMockCurrentUser();
            appendAuditLog({ action: "Document rejected", entityType: "document", entityId: id, userId, userName, details: doc.title });
        }
        setDocuments(docs => docs.map(d => d.id === id ? { ...d, status: "Rejected" } : d));
    };

    const handleRoute = (id: string) => {
        setRouteDocId(id);
        setRouteOpen(true);
    };

    const InboxTable = ({ statusFilter, canApprove, canRoute }: { statusFilter: string; canApprove: boolean; canRoute: boolean }) => {
        const filteredDocs = documents.filter(d => statusFilter === "All" ? true : d.status === statusFilter);

        if (filteredDocs.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <div className="bg-slate-50 p-4 rounded-full mb-3">
                        <FileText className="h-8 w-8 text-slate-300" />
                    </div>
                    <p>No documents found in this category.</p>
                </div>
            );
        }

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Document</TableHead>
                        <TableHead>Submitted By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredDocs.map((doc) => (
                        <TableRow key={doc.id}>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span className="font-medium text-slate-800">{doc.title}</span>
                                    <span className="text-xs text-slate-500">{doc.id} • {doc.type}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                        <AvatarFallback className="text-[10px] bg-blue-100 text-blue-600">{doc.submittedBy.initials}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm">{doc.submittedBy.name}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center text-slate-500 text-sm">
                                    <Calendar className="h-3 w-3 mr-2" />
                                    {doc.date}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={
                                    doc.status === "Approved" ? "default" :
                                        doc.status === "Rejected" ? "destructive" : "secondary"
                                } className={
                                    doc.status === "Approved" ? "bg-green-500 hover:bg-green-600" :
                                        doc.status === "Pending" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""
                                }>
                                    {doc.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title="View Document"
                                        onClick={() => router.push(`/inbox/${doc.id}`)}
                                    >
                                        <Eye className="h-4 w-4 text-slate-500" />
                                    </Button>
                                            {doc.status === "Pending" && (canApprove || canRoute) && (
                                                        <>
                                                            {canRoute && (doc.stage === "gatekeeper" || doc.stage === "department") && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                    onClick={() => handleRoute(doc.id)}
                                                                    title={doc.stage === "department" ? "Route to another department" : "Route to Department"}
                                                                >
                                                                    <GitMerge className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            {canApprove && (
                                                                <>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                                onClick={() => handleApprove(doc.id)}
                                                                title="Approve"
                                                            >
                                                                <CheckCircle2 className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                onClick={() => handleReject(doc.id)}
                                                                title="Reject"
                                                            >
                                                                <XCircle className="h-4 w-4" />
                                                            </Button>
                                                                </>
                                                            )}
                                                        </>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    };

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inbox</h1>
                <p className="text-slate-500 mt-2">Manage document approvals and review pending requests.</p>
            </div>

            <Card className="shadow-sm">
                <CardHeader className="bg-slate-50/50 border-b pb-4">
                    <CardTitle>Approval Requests</CardTitle>
                    <CardDescription>Review documents submitted by your team.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                    <Tabs defaultValue={defaultTab} className="w-full">
                        <TabsList className="mb-6 bg-slate-100">
                            <TabsTrigger value="Pending">Pending Review</TabsTrigger>
                            <TabsTrigger value="Approved">Approved</TabsTrigger>
                            <TabsTrigger value="Rejected">Rejected</TabsTrigger>
                            <TabsTrigger value="All">All Documents</TabsTrigger>
                        </TabsList>

                        <TabsContent value="Pending">
                            <InboxTable statusFilter="Pending" canApprove={canApprove} canRoute={canRoute} />
                        </TabsContent>
                        <TabsContent value="Approved">
                            <InboxTable statusFilter="Approved" canApprove={canApprove} canRoute={canRoute} />
                        </TabsContent>
                        <TabsContent value="Rejected">
                            <InboxTable statusFilter="Rejected" canApprove={canApprove} canRoute={canRoute} />
                        </TabsContent>
                        <TabsContent value="All">
                            <InboxTable statusFilter="All" canApprove={canApprove} canRoute={canRoute} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Route to Department dialog */}
            <Dialog open={routeOpen} onOpenChange={(open) => { setRouteOpen(open); if (!open) setRouteDocId(null); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Route Document</DialogTitle>
                        <DialogDescription>
                            Forward this document to a department for further review.
                        </DialogDescription>
                    </DialogHeader>
                    {routeDocId && (
                        <WorkflowRoutingForm
                            documentId={routeDocId}
                            onSuccess={(payload) => {
                                if (payload) {
                                    const doc = documents.find(d => d.id === routeDocId);
                                    const { userId, userName } = getMockCurrentUser();
                                    appendAuditLog({ action: "Document routed", entityType: "workflow", entityId: routeDocId!, userId, userName, details: doc ? `${doc.title} → ${payload.departmentName}` : payload.departmentName });
                                    const entry = createRoutingEntry(payload);
                                    setDocuments(docs =>
                                        docs.map(d =>
                                            d.id === routeDocId
                                                ? { ...d, routingHistory: [...(d.routingHistory ?? []), entry], stage: "department" as Stage }
                                                : d
                                        )
                                    );
                                }
                                setRouteOpen(false);
                                setRouteDocId(null);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
