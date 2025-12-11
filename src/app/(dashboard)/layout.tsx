"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { useState } from "react";
import {
    Menu,
    Bell,
    Mail,
    ChevronDown,
    LogOut,
    User,
    Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50">
            {/* Sidebar */}
            <aside className={`hidden h-full md:flex md:flex-col ${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300`}>
                <Sidebar isCollapsed={isCollapsed} />
            </aside>

            {/* Main Content Area */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header */}
                <header className="flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm">
                    <div className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="mr-4 text-slate-500 hover:text-slate-700"
                        >
                            <Menu className="h-6 w-6" />
                        </Button>
                        {/* Placeholder for Breadcrumbs or Page Title if needed */}
                        <div className="hidden md:block">
                            {/* <h1 className="text-xl font-semibold text-slate-800">Workspace</h1> */}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Icons */}
                        <Button variant="ghost" size="icon" className="relative text-slate-500 hover:text-slate-700">
                            <Mail className="h-5 w-5" />
                            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border border-white"></span>
                        </Button>
                        <Button variant="ghost" size="icon" className="relative text-slate-500 hover:text-slate-700">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border border-white"></span>
                        </Button>

                        {/* User Profile */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-1 h-10 hover:bg-slate-100 rounded-full">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src="https://ui-avatars.com/api/?name=Mark+Anderson&background=0D8ABC&color=fff" />
                                        <AvatarFallback>MA</AvatarFallback>
                                    </Avatar>
                                    <div className="hidden md:flex flex-col items-start">
                                        <span className="text-sm font-medium text-slate-700">Mark Anderson</span>
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-slate-500 ml-1" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                    <User className="mr-2 h-4 w-4" />
                                    <span>Profile</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <Settings className="mr-2 h-4 w-4" />
                                    <span>Settings</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Scrollable Content */}
                <main className="flex-1 overflow-y-auto bg-slate-50/50">
                    {children}
                </main>
            </div>
        </div>
    );
}
