"use client";

import { useState } from "react";
import {
    Folder as FolderIcon,
    FileText,
    Image as ImageIcon,
    Music,
    Video,
    MoreVertical,
    Search,
    Plus,
    LayoutGrid,
    List as ListIcon,
    ChevronsRight,
    HardDrive
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { DocumentUploadForm } from "@/components/forms/document-upload-form";

// --- Mock Data ---

const categories = [
    { name: "Files", icon: FolderIcon, count: 50, active: true },
    { name: "Images", icon: ImageIcon, count: 120, active: false },
    { name: "Documents", icon: FileText, count: 45, active: false },
    { name: "Media", icon: Video, count: 12, active: false },
    { name: "Projects", icon: LayoutGrid, count: 8, active: false },
];

const folders = [
    { id: 1, name: "Sketch Templates", items: "8 GB", date: "12.07.2019", color: "text-amber-400 fill-amber-400" },
    { id: 2, name: "Public Documents", items: "10 GB", date: "12.07.2019", color: "text-amber-400 fill-amber-400" },
    { id: 3, name: "Backups", items: "1 TB", date: "12.07.2019", color: "text-amber-400 fill-amber-400" },
    { id: 4, name: "Downloads", items: "250 GB", date: "12.07.2019", color: "text-amber-400 fill-amber-400" },
    { id: 5, name: "Resources", items: "4 GB", date: "12.07.2019", color: "text-amber-400 fill-amber-400" },
];

const files = [
    { id: 101, name: "Shopping_list.doc", type: "DOC", size: "1 MB", date: "12.07.2019", color: "bg-blue-500" },
    { id: 102, name: "Design_brief.doc", type: "DOC", size: "150 KB", date: "12.07.2019", color: "bg-blue-500" },
    { id: 103, name: "Prices.xls", type: "XLS", size: "1 MB", date: "12.07.2019", color: "bg-green-500" },
    { id: 104, name: "01_project_desc.pdf", type: "PDF", size: "150 MB", date: "12.07.2019", color: "bg-red-500" },
    { id: 105, name: "02_project_desc.pdf", type: "PDF", size: "160 MB", date: "12.07.2019", color: "bg-red-500" },
];

// --- Components ---

export default function FileManagerPage() {
    return (
        <div className="flex h-[calc(100vh-theme(spacing.16))] flex-col md:flex-row bg-slate-50/50">
            {/* Inner Sidebar */}
            <aside className="w-full md:w-64 bg-white border-r p-6 flex flex-col gap-6">
                <div>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button className="w-full bg-blue-600 hover:bg-blue-700">
                                <Plus className="mr-2 h-4 w-4" /> Upload File
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                            <DialogHeader>
                                <DialogTitle>Upload New Document</DialogTitle>
                                <DialogDescription>
                                    Add a document to the system repository.
                                </DialogDescription>
                            </DialogHeader>
                            <DocumentUploadForm />
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">Folders</h3>
                    {categories.map((cat) => (
                        <button
                            key={cat.name}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${cat.active
                                ? "bg-blue-50 text-blue-700"
                                : "text-slate-600 hover:bg-slate-50"
                                }`}
                        >
                            <div className="flex items-center">
                                <cat.icon className={`mr-3 h-4 w-4 ${cat.active ? "text-blue-600" : "text-slate-400"}`} />
                                {cat.name}
                            </div>
                            {cat.count > 0 && (
                                <span className={`text-xs ${cat.active ? "text-blue-600 font-bold" : "text-slate-400"}`}>
                                    {cat.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="mt-auto">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase">Storage</h3>
                        <span className="text-xs font-medium text-slate-700">30%</span>
                    </div>
                    <Progress value={30} className="h-2" />
                    <p className="text-xs text-slate-400 mt-2">15 GB of 50 GB used</p>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-6 md:p-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Files (50)</h1>
                        <nav className="flex items-center text-sm text-slate-500 mt-1">
                            <span>File Manager</span>
                            <ChevronsRight className="h-4 w-4 mx-2" />
                            <span className="text-slate-800">Files</span>
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <Input placeholder="Search Files..." className="pl-9 bg-white" />
                        </div>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button size="icon" className="bg-blue-600 rounded-full h-10 w-10 shadow-lg hover:bg-blue-700">
                                    <Plus className="h-5 w-5" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>Upload New Document</DialogTitle>
                                    <DialogDescription>
                                        Add a document to the system repository.
                                    </DialogDescription>
                                </DialogHeader>
                                <DocumentUploadForm />
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-4 mb-8">
                    <div className="bg-white border rounded-md px-3 py-2 flex items-center gap-2 text-sm text-slate-600 shadow-sm">
                        <span>01.12.18 / 07.12.18</span>
                    </div>
                    <Select defaultValue="all">
                        <SelectTrigger className="w-[140px] bg-white">
                            <SelectValue placeholder="File Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All types</SelectItem>
                            <SelectItem value="doc">Documents</SelectItem>
                            <SelectItem value="img">Images</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="ml-auto flex bg-white rounded-md border shadow-sm">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-r">
                            <LayoutGrid className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none">
                            <ListIcon className="h-4 w-4 text-slate-400" />
                        </Button>
                    </div>
                </div>

                {/* Content - Folders */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-slate-700 mb-4">Folders</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {folders.map(folder => (
                            <div key={folder.id} className="bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="h-5 w-5 rounded-full border border-blue-200 flex items-center justify-center">
                                        <div className="h-2.5 w-2.5 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 text-slate-400">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem>Open</DropdownMenuItem>
                                            <DropdownMenuItem>Rename</DropdownMenuItem>
                                            <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="flex justify-center mb-4">
                                    <FolderIcon className={`h-16 w-16 ${folder.color}`} />
                                </div>
                                <div className="text-center">
                                    <h3 className="font-medium text-slate-700 truncate">{folder.name}</h3>
                                    <div className="flex justify-between items-center mt-4 text-xs text-slate-400">
                                        <span>{folder.items}</span>
                                        <span>{folder.date}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content - Files */}
                <div>
                    <h2 className="text-lg font-semibold text-slate-700 mb-4">Files</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {files.map(file => (
                            <div key={file.id} className="bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="h-5 w-5 rounded-full border border-blue-200 flex items-center justify-center">
                                        <div className="h-2.5 w-2.5 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 text-slate-400">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem>Download</DropdownMenuItem>
                                            <DropdownMenuItem>Share</DropdownMenuItem>
                                            <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="flex justify-center mb-4 relative">
                                    <div className={`h-14 w-12 ${file.color} rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-md z-10`}>
                                        {file.type}
                                    </div>
                                    <div className="absolute top-1 -right-2 h-14 w-12 bg-slate-200 rounded-lg -z-0 rotate-6 opacity-40"></div>
                                </div>
                                <div className="text-center">
                                    <h3 className="font-medium text-slate-700 truncate text-sm">{file.name}</h3>
                                    <div className="flex justify-between items-center mt-4 text-xs text-slate-400">
                                        <span>{file.size}</span>
                                        <span>{file.date}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
