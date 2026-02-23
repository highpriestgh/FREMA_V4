"use client";

import { useState } from "react";
import { Bell, FileText, CheckCircle2, Clock, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NotifType = "action" | "idle" | "status";

interface Notification {
    id: string;
    type: NotifType;
    title: string;
    description: string;
    timestamp: string;
    read: boolean;
}

const initialNotifications: Notification[] = [
    {
        id: "n1",
        type: "action",
        title: "New document pending review",
        description: "\"Q3 Financial Report\" has been submitted and awaits your review.",
        timestamp: "2 minutes ago",
        read: false,
    },
    {
        id: "n2",
        type: "idle",
        title: "Document idle for 3 days",
        description: "\"Project Alpha Plan\" has had no activity. Please review or escalate.",
        timestamp: "1 hour ago",
        read: false,
    },
    {
        id: "n3",
        type: "status",
        title: "Document approved",
        description: "\"Invoice #4521\" was approved by Robert Fox.",
        timestamp: "Yesterday",
        read: false,
    },
    {
        id: "n4",
        type: "idle",
        title: "Document idle for 5 days",
        description: "\"Client Contract v2\" has been sitting in the queue. Action required.",
        timestamp: "2 days ago",
        read: true,
    },
    {
        id: "n5",
        type: "status",
        title: "Document rejected",
        description: "\"Budget Proposal Q4\" was rejected. Comments have been added.",
        timestamp: "3 days ago",
        read: true,
    },
];

const notifIcon: Record<NotifType, React.ReactNode> = {
    action: <FileText className="h-4 w-4 text-blue-600" />,
    idle: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    status: <CheckCircle2 className="h-4 w-4 text-green-600" />,
};

const notifBg: Record<NotifType, string> = {
    action: "bg-blue-50",
    idle: "bg-amber-50",
    status: "bg-green-50",
};

interface NotificationPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function NotificationPanel({ open, onOpenChange }: NotificationPanelProps) {
    const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);

    const markAllRead = () => setNotifications(n => n.map(x => ({ ...x, read: true })));
    const markRead = (id: string) => setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x));
    const dismiss = (id: string) => setNotifications(n => n.filter(x => x.id !== id));

    const unreadCount = notifications.filter(n => !n.read).length;
    const idleDocs = notifications.filter(n => n.type === "idle");

    const NotifList = ({ items }: { items: Notification[] }) => (
        <div className="space-y-2">
            {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <Bell className="h-8 w-8 mb-2 text-slate-200" />
                    <p className="text-sm">All clear!</p>
                </div>
            ) : (
                items.map(n => (
                    <div
                        key={n.id}
                        className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                            n.read ? "bg-white border-slate-100" : "bg-blue-50/60 border-blue-100",
                        )}
                        onClick={() => markRead(n.id)}
                    >
                        <div className={cn("p-2 rounded-full flex-shrink-0", notifBg[n.type])}>
                            {notifIcon[n.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-medium", n.read ? "text-slate-600" : "text-slate-800")}>
                                {n.title}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <Clock className="h-3 w-3 text-slate-400" />
                                <span className="text-[11px] text-slate-400">{n.timestamp}</span>
                                {!n.read && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 ml-auto mt-0.5" />
                                )}
                            </div>
                        </div>
                        <button
                            onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                            className="text-slate-300 hover:text-slate-500 flex-shrink-0 mt-0.5"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))
            )}
        </div>
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
                <SheetHeader className="px-5 pt-5 pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-blue-600" />
                            Notifications
                            {unreadCount > 0 && (
                                <Badge className="bg-blue-600 text-white text-xs px-1.5 py-0 h-5">
                                    {unreadCount}
                                </Badge>
                            )}
                        </SheetTitle>
                        {unreadCount > 0 && (
                            <Button variant="ghost" size="sm" className="text-xs text-blue-600" onClick={markAllRead}>
                                Mark all read
                            </Button>
                        )}
                    </div>
                </SheetHeader>

                <Tabs defaultValue="all" className="flex flex-col flex-1 overflow-hidden">
                    <TabsList className="mx-5 mt-4 mb-2 bg-slate-100 shrink-0">
                        <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                        <TabsTrigger value="unread" className="flex-1">
                            Unread {unreadCount > 0 && `(${unreadCount})`}
                        </TabsTrigger>
                        <TabsTrigger value="idle" className="flex-1">
                            Idle Docs {idleDocs.length > 0 && `(${idleDocs.length})`}
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex-1 overflow-y-auto px-5 pb-5">
                        <TabsContent value="all" className="mt-2">
                            <NotifList items={notifications} />
                        </TabsContent>
                        <TabsContent value="unread" className="mt-2">
                            <NotifList items={notifications.filter(n => !n.read)} />
                        </TabsContent>
                        <TabsContent value="idle" className="mt-2">
                            <NotifList items={idleDocs} />
                        </TabsContent>
                    </div>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}

// Export unread count helper for header badge
export function useUnreadCount(notifications: Notification[]) {
    return notifications.filter(n => !n.read).length;
}
