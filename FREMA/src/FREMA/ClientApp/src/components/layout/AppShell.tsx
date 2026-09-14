import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Inbox, Files, Upload, GitBranch, ChartBar, ShieldCheck,
  Settings, Users, KeyRound, Building2, Tag, MapPin, Route, SlidersHorizontal,
  LogOut, Menu as MenuIcon, X, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import type { MenuItem } from "@/lib/types";
import { cn } from "@/lib/utils";

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

export function AppShell() {
  const { profile, signOut } = useAuth();
  const [menu, setMenu] = useState<MenuItem[]>([]);
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
    <div className="bg-background min-h-screen">
      <header className="bg-background/95 sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="hover:bg-accent rounded-md p-2"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
        <span className="font-semibold tracking-tight">FREMA</span>
      </header>

      <div className="flex">
        <aside
          className={cn(
            "bg-sidebar text-sidebar-foreground fixed inset-y-0 z-30 w-64 shrink-0 border-r",
            "flex flex-col transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="hidden h-14 items-center border-b px-5 md:flex">
            <span className="font-semibold tracking-tight">FREMA</span>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {menu.map((item) =>
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

          <div className="border-t p-3">
            <div className="px-2 pb-2">
              <p className="truncate text-sm font-medium">{profile?.fullName}</p>
              <p className="text-muted-foreground truncate text-xs">
                {profile?.department ?? profile?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </aside>

        {open && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setOpen(false)}
          />
        )}

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
