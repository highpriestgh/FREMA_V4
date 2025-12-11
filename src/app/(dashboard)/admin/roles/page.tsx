"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Edit, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

const roleSchema = z.object({
    name: z.string().min(2, "Role name is required."),
    permissions: z.string().optional(), // In a real app, this would be a multi-select
});

const initialRoles = [
    { id: 1, name: "Administrator", permissions: ["ALL_ACCESS"], users: 2 },
    { id: 2, name: "Manager", permissions: ["APPROVE_DOCS", "VIEW_REPORTS"], users: 5 },
    { id: 3, name: "Record Officer", permissions: ["UPLOAD_DOCS", "VIEW_DOCS"], users: 12 },
    { id: 4, name: "Viewer", permissions: ["VIEW_DOCS"], users: 20 },
];

export default function RolesPage() {
    const [roles, setRoles] = useState(initialRoles);
    const [isOpen, setIsOpen] = useState(false);

    const form = useForm<z.infer<typeof roleSchema>>({
        resolver: zodResolver(roleSchema),
        defaultValues: { name: "", permissions: "" }
    });

    function onSubmit(values: z.infer<typeof roleSchema>) {
        const newRole = {
            id: roles.length + 1,
            name: values.name,
            permissions: ["VIEW_DOCS"], // Default mock permission
            users: 0
        };
        setRoles([...roles, newRole]);
        setIsOpen(false);
        form.reset();
    }

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Roles & Permissions</h1>
                    <p className="text-slate-500 mt-2">Define user roles and their access levels.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="mr-2 h-4 w-4" /> Create Role
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Role</DialogTitle>
                            <DialogDescription>Define a new role for system users.</DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Role Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Auditor" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter>
                                    <Button type="submit">Create Role</Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {roles.map((role) => (
                    <Card key={role.id} className="shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2 bg-slate-50/80 border-b rounded-t-lg">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                    <ShieldAlertIcon className="h-4 w-4" />
                                </div>
                                <CardTitle className="text-base font-semibold text-slate-800">{role.name}</CardTitle>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600">
                                <Edit className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <p className="text-sm text-slate-500 mb-4 flex items-center">
                                <UsersIcon className="h-4 w-4 mr-2" />
                                {role.users} Users assigned
                            </p>

                            <div className="flex flex-wrap gap-2">
                                {role.permissions.map(perm => (
                                    <Badge key={perm} variant="secondary" className="text-xs bg-slate-100 text-slate-600 border border-slate-200">
                                        {perm.replace("_", " ")}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function ShieldAlertIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
        </svg>
    )
}
