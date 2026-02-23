"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  Settings,
  FileText,
  BarChart3,
  Bell,
  MapPin,
  Files,
  ShieldAlert,
  GitMerge,
  ScrollText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser, usePermissionCheck } from "@/contexts/current-user-context";
import { PERMISSIONS } from "@/lib/permissions-mock";

interface SidebarProps {
  isCollapsed: boolean;
}

const navItems: { name: string; href: string; icon: typeof LayoutDashboard; permission: keyof typeof PERMISSIONS }[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "VIEW_DOCS" },
  { name: "File Manager", href: "/documents", icon: FolderOpen, permission: "VIEW_DOCS" },
  { name: "Inbox", href: "/inbox", icon: Bell, permission: "VIEW_DOCS" },
  { name: "Workflows", href: "/workflows", icon: GitMerge, permission: "VIEW_DOCS" },
  { name: "Reports", href: "/reports", icon: BarChart3, permission: "VIEW_REPORTS" },
];

const adminItems: { name: string; href: string; icon: typeof ScrollText; permission: keyof typeof PERMISSIONS }[] = [
  { name: "Audit Trail", href: "/audit", icon: ScrollText, permission: "VIEW_AUDIT" },
  { name: "Users", href: "/admin/users", icon: Users, permission: "MANAGE_USERS" },
  { name: "Roles & Permissions", href: "/admin/roles", icon: ShieldAlert, permission: "MANAGE_ROLES" },
  { name: "Document Origins", href: "/admin/origins", icon: MapPin, permission: "MANAGE_ORIGINS" },
  { name: "Document Types", href: "/admin/types", icon: Files, permission: "MANAGE_TYPES" },
  { name: "Settings", href: "/admin/settings", icon: Settings, permission: "MANAGE_USERS" },
];

export function Sidebar({ isCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const user = useCurrentUser();
  const can = usePermissionCheck();
  const visibleNavItems = navItems.filter((item) => can(PERMISSIONS[item.permission]));
  const visibleAdminItems = adminItems.filter((item) => can(PERMISSIONS[item.permission]));

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
        <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-white">
          <Image src="/logo.png" alt="FREMA" fill className="object-cover" />
        </div>
        {!isCollapsed && (
          <span className="ml-3 text-lg font-bold tracking-tight animate-in fade-in duration-300 whitespace-nowrap">
            FREMA
          </span>
        )}
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto py-6">
        <nav className="space-y-1 px-3">
          {visibleNavItems.map((item) => (
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
            {visibleAdminItems.map((item) => (
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
            {visibleAdminItems.map((item) => (
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
            {user?.initials ?? "?"}
          </div>
          {!isCollapsed && (
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user?.name ?? "—"}</p>
              <p className="text-xs text-slate-400 truncate">{user?.role ?? ""}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
