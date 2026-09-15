import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";

interface ToastOptions {
  tone: Tone;
  title: string;
  detail?: string;
  /** A single follow-up action, e.g. "Sign in again". */
  action?: { label: string; onClick: () => void };
  /** Stays until dismissed or acted on, for messages the user must not miss. */
  persistent?: boolean;
}

interface Toast extends ToastOptions {
  id: number;
  leaving: boolean;
}

interface ToastApi {
  success: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  show: (options: ToastOptions) => void;
  /**
   * Reports a failed request using the server's own wording.
   * The API returns RFC 9457 ProblemDetails, so the message a user sees is the one the
   * domain actually wrote — "A reason is required when returning a document" rather than
   * a generic failure.
   */
  fromError: (error: unknown, fallback?: string) => void;
}

/** More than this and older toasts make way — a burst of failures must not bury the page. */
const MAX_VISIBLE = 4;
/** Matches the exit animation below. */
const EXIT_MS = 200;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    // Mark first so the exit animation can play, then remove.
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;

      setToasts((current) => {
        // The same message twice in a row — say, several panels failing to load at once — is
        // shown once.
        const duplicate = current.find(
          (t) => !t.leaving && t.title === options.title && t.detail === options.detail,
        );
        if (duplicate) return current;

        const next = [...current, { ...options, id, leaving: false }];
        const live = next.filter((t) => !t.leaving);
        const excess = live.length - MAX_VISIBLE;
        return excess > 0
          ? next.filter((t) => !live.slice(0, excess).some((old) => old.id === t.id))
          : next;
      });

      if (!options.persistent) {
        // Errors stay longer: they usually carry something the user has to read and act on.
        setTimeout(() => dismiss(id), options.tone === "error" ? 8000 : 4000);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, detail) => show({ tone: "success", title, detail }),
      info: (title, detail) => show({ tone: "info", title, detail }),
      error: (title, detail) => show({ tone: "error", title, detail }),
      fromError: (error, fallback = "Something went wrong") => {
        // An expired session is announced once, by the session watcher, with a way back in.
        if (error instanceof ApiError && error.isUnauthenticated) return;

        if (error instanceof ApiError) {
          show({ tone: "error", title: error.title || fallback, detail: error.message });
        } else if (error instanceof TypeError) {
          // fetch throws TypeError when the server cannot be reached at all.
          show({ tone: "error", title: fallback, detail: "The server could not be reached. Check your connection and try again." });
        } else {
          show({ tone: "error", title: fallback, detail: error instanceof Error ? error.message : undefined });
        }
      },
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* aria-live so a screen reader announces the outcome of an action it did not see. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cn(
              "bg-background pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg",
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200",
              toast.leaving && "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:slide-out-to-right-4 opacity-0",
              toast.tone === "error" && "border-destructive/40",
            )}
          >
            <ToneIcon tone={toast.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.detail && <p className="text-muted-foreground mt-0.5 text-sm">{toast.detail}</p>}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.onClick();
                    dismiss(toast.id);
                  }}
                  className="text-primary mt-2 text-sm font-medium underline-offset-4 hover:underline"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToneIcon({ tone }: { tone: Tone }) {
  const className = "size-5 shrink-0";

  if (tone === "success") {
    return <CheckCircle2 className={cn(className, "text-emerald-600 dark:text-emerald-500")} aria-hidden />;
  }
  if (tone === "error") {
    return <XCircle className={cn(className, "text-destructive")} aria-hidden />;
  }
  return <Info className={cn(className, "text-muted-foreground")} aria-hidden />;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return context;
}
