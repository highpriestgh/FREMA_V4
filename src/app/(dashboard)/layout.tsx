"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Menu,
    Bell,
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
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { useCurrentUser, useLogout } from "@/contexts/current-user-context";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const user = useCurrentUser();
    const logout = useLogout();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const UNREAD_COUNT = 3; // mock

    const handleLogout = () => {
        logout();
        router.push("/login");
    };

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
                        <div className="hidden md:block">
                            {/* Breadcrumbs placeholder */}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Bell / Notifications */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative text-slate-500 hover:text-slate-700"
                            onClick={() => setNotifOpen(true)}
                        >
                            <Bell className="h-5 w-5" />
                            {UNREAD_COUNT > 0 && (
                                <span className="absolute top-1.5 right-1.5 h-4 w-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold border border-white">
                                    {UNREAD_COUNT}
                                </span>
                            )}
                        </Button>

                        {/* User Profile */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-1 h-10 hover:bg-slate-100 rounded-full">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={user ? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0D8ABC&color=fff` : undefined} />
                                        <AvatarFallback>{user?.initials ?? "?"}</AvatarFallback>
                                    </Avatar>
                                    <div className="hidden md:flex flex-col items-start">
                                        <span className="text-sm font-medium text-slate-700">{user?.name ?? "—"}</span>
                                        {user && <span className="text-xs text-slate-500">{user.role}</span>}
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
                                <DropdownMenuItem className="text-red-600" onClick={handleLogout}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Notification Panel */}
                <NotificationPanel open={notifOpen} onOpenChange={setNotifOpen} />

                {/* Scrollable Content */}
                <main className="flex-1 overflow-y-auto bg-slate-50/50 p-6 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}

