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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Edit } from "lucide-react";
import { useState } from "react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const originSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    code: z.string().min(2, "Code must be at least 2 characters."),
    description: z.string().optional(),
});

// Mock Initial Data
const initialOrigins = [
    { id: 1, name: "Accra HQ", code: "ACC-HQ", description: "Main Headquarters in Accra" },
    { id: 2, name: "Kumasi Branch", code: "KUM-BR", description: "Regional Office" },
    { id: 3, name: "Tamale Office", code: "TAM-OFF", description: "Northern Regional Office" },
];

export default function DocumentOriginsPage() {
    const [origins, setOrigins] = useState(initialOrigins);
    const [isOpen, setIsOpen] = useState(false);

    const form = useForm<z.infer<typeof originSchema>>({
        resolver: zodResolver(originSchema),
        defaultValues: {
            name: "",
            code: "",
            description: ""
        }
    });

    function onSubmit(values: z.infer<typeof originSchema>) {
        const newOrigin = {
            id: origins.length + 1,
            ...values,
            description: values.description || ""
        };
        setOrigins([...origins, newOrigin]);
        setIsOpen(false);
        form.reset();
    }

    const handleDelete = (id: number) => {
        setOrigins(origins.filter(item => item.id !== id));
    };

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Document Origins</h1>
                    <p className="text-slate-500 mt-2">Manage the sources/locations where documents originate.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="mr-2 h-4 w-4" /> Add Origin
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Origin</DialogTitle>
                            <DialogDescription>Create a new location or source for documents.</DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Takoradi Hub" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="code"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Code</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. TKR-HUB" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Optional description" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter>
                                    <Button type="submit">Save Origin</Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-lg bg-white shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {origins.map((origin) => (
                            <TableRow key={origin.id}>
                                <TableCell className="font-medium">{origin.name}</TableCell>
                                <TableCell>{origin.code}</TableCell>
                                <TableCell className="text-slate-500">{origin.description}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600">
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600"
                                        onClick={() => handleDelete(origin.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
