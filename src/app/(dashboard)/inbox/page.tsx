"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Eye, FileText, Calendar } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Mock Data
const initialDocuments = [
    {
        id: "DOC-001",
        title: "Q3 Financial Report",
        submittedBy: { name: "John Doe", initials: "JD" },
        date: "2024-10-24",
        status: "Pending",
        type: "Report"
    },
    {
        id: "DOC-002",
        title: "Project Alpha Plan",
        submittedBy: { name: "Sarah Smith", initials: "SS" },
        date: "2024-10-23",
        status: "Pending",
        type: "Memo"
    },
    {
        id: "DOC-003",
        title: "Invoice #4521",
        submittedBy: { name: "Mike Jones", initials: "MJ" },
        date: "2024-10-22",
        status: "Approved",
        type: "Invoice"
    },
    {
        id: "DOC-004",
        title: "Client Contract v2",
        submittedBy: { name: "Emily Blunt", initials: "EB" },
        date: "2024-10-21",
        status: "Rejected",
        type: "Contract"
    },
];

export default function InboxPage() {
    const [documents, setDocuments] = useState(initialDocuments);

    const handleApprove = (id: string) => {
        setDocuments(docs => docs.map(d => d.id === id ? { ...d, status: "Approved" } : d));
    };

    const handleReject = (id: string) => {
        setDocuments(docs => docs.map(d => d.id === id ? { ...d, status: "Rejected" } : d));
    };

    const InboxTable = ({ statusFilter }: { statusFilter: string }) => {
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
                                    <Button variant="ghost" size="icon" title="View Document">
                                        <Eye className="h-4 w-4 text-slate-500" />
                                    </Button>
                                    {doc.status === "Pending" && (
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
                    <Tabs defaultValue="Pending" className="w-full">
                        <TabsList className="mb-6 bg-slate-100">
                            <TabsTrigger value="Pending">Pending Review</TabsTrigger>
                            <TabsTrigger value="Approved">Approved</TabsTrigger>
                            <TabsTrigger value="Rejected">Rejected</TabsTrigger>
                            <TabsTrigger value="All">All Documents</TabsTrigger>
                        </TabsList>

                        <TabsContent value="Pending">
                            <InboxTable statusFilter="Pending" />
                        </TabsContent>
                        <TabsContent value="Approved">
                            <InboxTable statusFilter="Approved" />
                        </TabsContent>
                        <TabsContent value="Rejected">
                            <InboxTable statusFilter="Rejected" />
                        </TabsContent>
                        <TabsContent value="All">
                            <InboxTable statusFilter="All" />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
