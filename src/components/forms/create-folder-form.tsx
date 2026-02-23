"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { FolderPlus } from "lucide-react";

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
} from "@/components/ui/select";

const formSchema = z.object({
    name: z.string().min(1, { message: "Folder name is required." }),
    parentId: z.string().optional(),
});

// Mock list of existing folders as parent options
const existingFolders = [
    { id: "folder-1", name: "Sketch Templates" },
    { id: "folder-2", name: "Public Documents" },
    { id: "folder-3", name: "Backups" },
    { id: "folder-4", name: "Downloads" },
    { id: "folder-5", name: "Resources" },
];

interface CreateFolderFormProps {
    onSuccess?: () => void;
}

export function CreateFolderForm({ onSuccess }: CreateFolderFormProps) {
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            parentId: "",
        },
    });

    function onSubmit(values: z.infer<typeof formSchema>) {
        console.log("Create folder:", values);
        alert(`Folder "${values.name}" created successfully!`);
        form.reset();
        onSuccess?.();
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Folder Icon Preview */}
                <div className="flex justify-center py-4">
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                        <FolderPlus className="h-12 w-12 text-amber-400 fill-amber-100" />
                    </div>
                </div>

                {/* Folder Name */}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Folder Name</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. Project Reports 2024" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Parent Folder (optional) */}
                <FormField
                    control={form.control}
                    name="parentId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Parent Folder{" "}
                                <span className="text-slate-400 font-normal">(optional)</span>
                            </FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="None (root level)" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {existingFolders.map((folder) => (
                                        <SelectItem key={folder.id} value={folder.id}>
                                            {folder.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                    Create Folder
                </Button>
            </form>
        </Form>
    );
}
