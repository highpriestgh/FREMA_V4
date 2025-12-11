
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  UploadCloud,
  Users,
  Settings,
  FileText,
  BarChart3,
  Bell,
  MapPin,
  Files,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react"; // Using lucide-react (standard in Shadcn)
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "File Manager", href: "/documents", icon: FolderOpen },
  { name: "Inbox", href: "/inbox", icon: Bell },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

const adminItems = [
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Roles & Permissions", href: "/admin/roles", icon: ShieldAlert },
  { name: "Document Origins", href: "/admin/origins", icon: MapPin },
  { name: "Document Types", href: "/admin/types", icon: Files },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

interface SidebarProps {
  isCollapsed: boolean;
}

export function Sidebar({ isCollapsed }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn(
      "flex h-full min-h-screen flex-col border-r bg-gradient-to-b from-slate-800 to-slate-950 text-white transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      {/* Header / Logo Area - Optional if we want brand in sidebar */}
      <div className={cn(
        "flex h-16 items-center border-b border-slate-700 transition-all",
        isCollapsed ? "justify-center px-0" : "px-6"
      )}>
        <FileText className="h-6 w-6 text-blue-400 flex-shrink-0" />
        {!isCollapsed && (
          <span className="ml-2 text-lg font-bold tracking-tight animate-in fade-in duration-300 whitespace-nowrap">
            FREMA
          </span>
        )}
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto py-6">
        <nav className="space-y-1 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
            >
              <span
                title={isCollapsed ? item.name : ""}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === item.href || pathname?.startsWith(item.href + "/")
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  isCollapsed && "justify-center"
                )}
              >
                <item.icon className={cn("h-5 w-5 flex-shrink-0", !isCollapsed && "mr-3")} />
                {!isCollapsed && item.name}
              </span>
            </Link>
          ))}
        </nav>

        {/* Admin Section */}
        <div className={cn("mt-8 px-6 text-xs font-semibold uppercase tracking-wider text-slate-500 transition-opacity whitespace-nowrap overflow-hidden",
          isCollapsed && "hidden"
        )}>
          Administration
        </div>
        {!isCollapsed && (
          <nav className="mt-2 space-y-1 px-3">
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
              >
                <span
                  className={cn(
                    "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </span>
              </Link>
            ))}
          </nav>
        )}
        {/* Collapsed Admin Icons Only */}
        {isCollapsed && (
          <nav className="mt-2 space-y-1 px-3 border-t border-slate-700 pt-4">
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
              >
                <span
                  title={item.name}
                  className={cn(
                    "flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                </span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* User Footer */}
      <div className="border-t border-slate-700 p-4">
        <div className={cn("flex items-center", isCollapsed && "justify-center")}>
          <div className="h-9 w-9 rounded-full bg-blue-500 flex items-center justify-center text-medium font-bold flex-shrink-0">
            JD
          </div>
          {!isCollapsed && (
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">John Doe</p>
              <p className="text-xs text-slate-400 truncate">Record Officer</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
