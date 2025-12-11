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
import { Plus, Trash2, Edit, Users, UserCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const userSchema = z.object({
    firstName: z.string().min(2, "First Name required"),
    lastName: z.string().min(2, "Last Name required"),
    email: z.string().email("Invalid email"),
    role: z.string().min(1, "Role required"),
});

// Mock Initial Data
const initialUsers = [
    { id: 1, firstName: "John", lastName: "Doe", email: "john@example.com", role: "Administrator", status: "Active" },
    { id: 2, firstName: "Sarah", lastName: "Smith", email: "sarah@example.com", role: "Manager", status: "Active" },
    { id: 3, firstName: "Michael", lastName: "Brown", email: "mike@example.com", role: "Viewer", status: "Inactive" },
    { id: 4, firstName: "Emily", lastName: "Davis", email: "emily@example.com", role: "Editor", status: "Active" },
    { id: 5, firstName: "David", lastName: "Wilson", email: "david@example.com", role: "Viewer", status: "Active" },
];

export default function UsersPage() {
    const [users, setUsers] = useState(initialUsers);
    const [isOpen, setIsOpen] = useState(false);

    const form = useForm<z.infer<typeof userSchema>>({
        resolver: zodResolver(userSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            role: ""
        }
    });

    function onSubmit(values: z.infer<typeof userSchema>) {
        const newUser = {
            id: users.length + 1,
            ...values,
            status: "Active"
        };
        setUsers([...users, newUser]);
        setIsOpen(false);
        form.reset();
    }

    const handleDelete = (id: number) => {
        setUsers(users.filter(item => item.id !== id));
    };

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">User Management</h1>
                    <p className="text-slate-500 mt-2">Manage system access and user accounts.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="mr-2 h-4 w-4" /> Add User
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader className="bg-slate-50 border-b pb-4 -mx-6 -mt-6 px-6 pt-6 rounded-t-lg">
                            <DialogTitle>Add New User</DialogTitle>
                            <DialogDescription>Create a new user account for the system.</DialogDescription>
                        </DialogHeader>
                        <div className="pt-4">
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="firstName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>First Name</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="John" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="lastName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Last Name</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Doe" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="john@example.com" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="role"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Role</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="e.g. Viewer" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <DialogFooter>
                                        <Button type="submit">Create User</Button>
                                    </DialogFooter>
                                </form>
                            </Form>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-blue-50 border-blue-100 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                        <CardTitle className="text-sm font-semibold text-blue-700">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-blue-900">{users.length}</div>
                        <p className="text-xs text-blue-600/80">+2 from last month</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-100 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                        <CardTitle className="text-sm font-semibold text-green-700">Active Users</CardTitle>
                        <UserCheck className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-green-900">{users.filter(u => u.status === 'Active').length}</div>
                        <p className="text-xs text-green-600/80">Currently active</p>
                    </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-100 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                        <CardTitle className="text-sm font-semibold text-purple-700">Administrators</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-purple-900">{users.filter(u => u.role === 'Administrator').length}</div>
                        <p className="text-xs text-purple-600/80">Full access level</p>
                    </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-100 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                        <CardTitle className="text-sm font-semibold text-amber-700">Total Roles</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-amber-900">4</div>
                        <p className="text-xs text-amber-600/80">System roles defined</p>
                    </CardContent>
                </Card>
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={`https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}`} />
                                        <AvatarFallback>{user.firstName[0]}{user.lastName[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-medium">{user.firstName} {user.lastName}</div>
                                        <div className="text-xs text-slate-500">{user.email}</div>
                                    </div>
                                </TableCell>
                                <TableCell>{user.role}</TableCell>
                                <TableCell>
                                    <Badge variant={user.status === 'Active' ? 'default' : 'secondary'} className={user.status === 'Active' ? 'bg-green-500 hover:bg-green-600' : ''}>
                                        {user.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600">
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600"
                                        onClick={() => handleDelete(user.id)}
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
