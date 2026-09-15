import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Inbox, Files, Upload, GitBranch, ChartBar, ShieldCheck,
  Settings, Users, KeyRound, Building2, Tag, MapPin, Route, SlidersHorizontal,
  Menu as MenuIcon, X, type LucideIcon,
} from "lucide-react";
import { useClientSettings } from "@/components/layout/ClientSettings";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { UserMenu } from "@/components/layout/UserMenu";
import { api } from "@/lib/api";
import type { MenuItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Maps the icon names the server stores to components.
 * The server sends a name, never markup — it has no business knowing which icon set the
 * client uses, and an unknown name degrades to a sensible default rather than breaking.
 */
const icons: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  inbox: Inbox,
  files: Files,
  upload: Upload,
  "git-branch": GitBranch,
  "chart-bar": ChartBar,
  "shield-check": ShieldCheck,
  settings: Settings,
  users: Users,
  key: KeyRound,
  building: Building2,
  tag: Tag,
  "map-pin": MapPin,
  route: Route,
  sliders: SlidersHorizontal,
};

function Icon({ name, className }: { name: string | null; className?: string }) {
  const Component = (name && icons[name]) || Files;
  return <Component className={className} aria-hidden />;
}

/**
 * The signed-in layout: navigation down the left, a header across the top of the page with
 * notifications and the user's own menu on the right.
 */
export function AppShell() {
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // The menu is built server-side from the user's permissions, so this renders whatever
    // it is given without deciding anything itself.
    void api.get<MenuItem[]>("/api/menu").then(setMenu);
  }, []);

  // Close the mobile drawer on navigation, or it stays open over the new page.
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="bg-background flex min-h-screen">
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r",
          "transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b px-5">
          <Brand />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="hover:bg-accent -mr-2 rounded-md p-2 md:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {menu === null &&
            Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          {menu?.map((item) =>
            item.children.length > 0 ? (
              <div key={item.id} className="pt-3">
                <p className="text-muted-foreground px-3 pb-1 text-xs font-medium tracking-wide uppercase">
                  {item.label}
                </p>
                {item.children.map((child) => (
                  <NavItem key={child.id} item={child} />
                ))}
              </div>
            ) : (
              <NavItem key={item.id} item={item} />
            ),
          )}
        </nav>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hover:bg-accent -ml-2 rounded-md p-2 md:hidden"
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <MenuIcon className="size-5" />
          </button>
          {/* On small screens the sidebar is hidden, so the header carries the brand. */}
          <span className="min-w-0 md:hidden">
            <Brand />
          </span>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <span className="bg-border mx-2 hidden h-6 w-px sm:block" aria-hidden />
            <UserMenu />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ item }: { item: MenuItem }) {
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "hover:bg-sidebar-accent/50",
        )
      }
    >
      <Icon name={item.icon} className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

/** The organisation's name and logo, as set in Settings. */
function Brand() {
  const { settings } = useClientSettings();

  return (
    <span className="flex min-w-0 items-center gap-2">
      {settings?.logoUrl && <img src={settings.logoUrl} alt="" className="h-7 w-auto max-w-20 object-contain" />}
      <span className="truncate font-semibold tracking-tight">{settings?.organisationName ?? " "}</span>
    </span>
  );
}
