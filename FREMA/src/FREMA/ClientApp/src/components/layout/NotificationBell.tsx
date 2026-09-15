import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import type { PagedResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Notification {
  id: string;
  message: string;
  documentId: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** How often the unread count is refreshed while the app is open. */
const POLL_MS = 60_000;

/**
 * Reminders and other in-app notifications.
 * Polls for the unread count; there is no push channel yet, so a new reminder can take up to
 * a minute to appear.
 */
export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  const loadUnread = useCallback(async () => {
    // Background: this runs every minute and must not flash the loading bar each time.
    const page = await api.get<PagedResult<Notification>>("/api/notifications", { unreadOnly: true, pageSize: 1 }, undefined, { background: true });
    setUnread(page.totalCount);
  }, []);

  const loadList = useCallback(async () => {
    const page = await api.get<PagedResult<Notification>>("/api/notifications", { pageSize: 20 });
    setItems(page.items);
  }, []);

  useEffect(() => {
    void loadUnread();
    const timer = setInterval(() => void loadUnread(), POLL_MS);
    return () => clearInterval(timer);
  }, [loadUnread]);

  useEffect(() => {
    if (!open) return;
    void loadList();

    const close = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open, loadList]);

  async function openItem(item: Notification) {
    if (!item.isRead) {
      await api.post(`/api/notifications/${item.id}/read`);
      void loadUnread();
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  async function markAllRead() {
    await api.post("/api/notifications/read-all");
    setItems((current) => current?.map((i) => ({ ...i, isRead: true })) ?? current);
    setUnread(0);
  }

  return (
    <div ref={panel} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="hover:bg-accent relative rounded-md p-2"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full px-1 text-[10px] leading-4.5 font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        // Anchored to the right: the bell sits at the right-hand end of the header.
        <div className="bg-popover text-popover-foreground absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="text-muted-foreground hover:text-foreground text-xs">
                Mark all read
              </button>
            )}
          </div>

          <ul className="max-h-96 overflow-y-auto">
            {items === null &&
              Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="space-y-1.5 px-3 py-2.5"><Skeleton className="h-4 w-11/12" /><Skeleton className="h-3 w-24" /></li>
              ))}
            {items?.length === 0 && <li className="text-muted-foreground px-3 py-6 text-center text-sm">No notifications.</li>}
            {items?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openItem(item)}
                  className={cn("hover:bg-accent flex w-full gap-2 px-3 py-2.5 text-left text-sm", !item.isRead && "bg-accent/40")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.isRead ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block">{item.message}</span>
                    <span className="text-muted-foreground block text-xs">{new Date(item.createdAt).toLocaleString()}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
