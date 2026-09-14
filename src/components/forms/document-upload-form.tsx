"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { UploadCloud, File, X, ScanLine } from "lucide-react";
import { useState } from "react";
import dynamic from "next/dynamic";

// Load scanner lazily — it pulls OpenCV from CDN and uses getUserMedia
const ScannerModal = dynamic(
  () => import("@/components/scanner/scanner-modal").then((m) => m.ScannerModal),
  { ssr: false }
);

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
}
    from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { appendAuditLog, getMockCurrentUser } from "@/lib/audit-mock";
import { useCan } from "@/contexts/current-user-context";
import { PERMISSIONS } from "@/lib/permissions-mock";

// Form Schema
const formSchema = z.object({
    title: z.string().min(2, {
        message: "Title must be at least 2 characters.",
    }),
    referenceNumber: z.string().min(2, {
        message: "Reference Number is required.",
    }),
    folderId: z.string().min(1, {
        message: "Please select a destination folder.",
    }),
    type: z.string().min(1, {
        message: "Please select a document type.",
    }),
    location: z.string().min(1, {
        message: "Please select a location/origin.",
    }),
    description: z.string().optional(),
});

export function DocumentUploadForm() {
    const [file, setFile] = useState<File | null>(null);
    const [mode, setMode] = useState<"upload" | "scan">("upload");
    const [showScanner, setShowScanner] = useState(false);
    const canUpload = useCan(PERMISSIONS.UPLOAD_DOCS);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            referenceNumber: "",
            description: "",
            location: "",
            type: "",
            folderId: ""
        },
    });

    function onSubmit(values: z.infer<typeof formSchema>) {
        // Mock Submit
        console.log(values);
        console.log(file);
        const { userId, userName } = getMockCurrentUser();
        appendAuditLog({ action: "Document uploaded", entityType: "document", entityId: values.referenceNumber, userId, userName, details: values.title });
        alert("Document Uploaded Successfully!");
    }

    function handleScanComplete(scannedFile: File) {
        setFile(scannedFile);
        setMode("scan");
    }

    return (
        <div className="grid gap-6">
            {/* Form Section */}
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Document Title</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g. Q3 Financial Report" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="referenceNumber"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reference Number</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g. REF-2024-001" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Document Origin</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select origin" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="accra-hq">Accra HQ</SelectItem>
                                        <SelectItem value="kumasi-branch">Kumasi Branch</SelectItem>
                                        <SelectItem value="external">External Source</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="folderId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Target Folder</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select folder" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="folder-1">Sketch Templates</SelectItem>
                                        <SelectItem value="folder-2">Public Documents</SelectItem>
                                        <SelectItem value="folder-3">Backups</SelectItem>
                                        <SelectItem value="folder-4">Downloads</SelectItem>
                                        <SelectItem value="folder-5">Resources</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Document Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="memo">Memo</SelectItem>
                                        <SelectItem value="letter">Letter</SelectItem>
                                        <SelectItem value="report">Report</SelectItem>
                                        <SelectItem value="invoice">Invoice</SelectItem>
                                        <SelectItem value="policy">Policy</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* File Upload / Scan Section */}
                    <div className="space-y-2">
                        <FormLabel>Scan or Upload Document</FormLabel>
                        <div className="flex gap-2 mb-2">
                            <Button
                                type="button"
                                variant={mode === "upload" ? "default" : "outline"}
                                size="sm"
                                onClick={() => { setMode("upload"); setFile(null); }}
                            >
                                <UploadCloud className="h-4 w-4 mr-1" />
                                Upload
                            </Button>
                            <Button
                                type="button"
                                variant={mode === "scan" ? "default" : "outline"}
                                size="sm"
                                onClick={() => { setMode("scan"); setFile(null); setShowScanner(true); }}
                            >
                                <ScanLine className="h-4 w-4 mr-1" />
                                Scan from device
                            </Button>
                        </div>
                        {mode === "upload" ? (
                            !file ? (
                                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer relative bg-slate-50/50">
                                    <input
                                        type="file"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) setFile(e.target.files[0]);
                                        }}
                                    />
                                    <div className="bg-blue-100 p-3 rounded-full mb-3">
                                        <UploadCloud className="h-6 w-6 text-blue-600" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-slate-700">Click to upload or drag</h3>
                                    <p className="text-xs text-slate-500 mt-1">PDF, JPG up to 10MB</p>
                                </div>
                            ) : (
                                <div className="border rounded-lg p-3 flex items-center justify-between bg-blue-50 border-blue-100">
                                    <div className="flex items-center space-x-3">
                                        <div className="bg-white p-2 rounded border">
                                            <File className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{file.name}</p>
                                            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                                        <X className="h-4 w-4 text-slate-500 hover:text-red-500" />
                                    </Button>
                                </div>
                            )
                        ) : !file ? (
                            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center bg-slate-50/50">
                                <div className="bg-amber-100 p-3 rounded-full mb-3">
                                    <ScanLine className="h-6 w-6 text-amber-600" />
                                </div>
                                <h3 className="text-sm font-semibold text-slate-700">Scan from connected device</h3>
                                <p className="text-xs text-slate-500 mt-1">Uses your webcam or phone camera as a document scanner</p>
                                <Button type="button" className="mt-3" onClick={() => setShowScanner(true)}>
                                    Open Scanner
                                </Button>
                            </div>
                        ) : (
                            <div className="border rounded-lg p-3 flex items-center justify-between bg-blue-50 border-blue-100">
                                <div className="flex items-center space-x-3">
                                    <div className="bg-white p-2 rounded border">
                                        <File className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{file.name}</p>
                                        <p className="text-xs text-slate-500">Scanned image • {(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                                    <X className="h-4 w-4 text-slate-500 hover:text-red-500" />
                                </Button>
                            </div>
                        )}
                    </div>

                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={!canUpload}>
                        Submit Document
                    </Button>
                    {!canUpload && (
                        <p className="text-xs text-amber-600">You don’t have permission to upload documents.</p>
                    )}
                </form>
            </Form>

            {/* Scanner Modal — full-screen camera overlay */}
            {showScanner && (
                <ScannerModal
                    onComplete={handleScanComplete}
                    onClose={() => setShowScanner(false)}
                />
            )}
        </div>
    );
}
