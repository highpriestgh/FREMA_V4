import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: Tone;
  title: string;
  detail?: string;
}

interface ToastApi {
  success: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  /**
   * Reports a failed request using the server's own wording.
   * The API returns RFC 9457 ProblemDetails, so the message a user sees is the one the
   * domain actually wrote — "A reason is required when returning a document" rather than
   * a generic failure.
   */
  fromError: (error: unknown, fallback?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback(
    (id: number) => setToasts((current) => current.filter((t) => t.id !== id)),
    [],
  );

  const push = useCallback(
    (tone: Tone, title: string, detail?: string) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, tone, title, detail }]);

      // Errors stay longer: they usually carry something the user has to read and act on.
      setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, detail) => push("success", title, detail),
      info: (title, detail) => push("info", title, detail),
      error: (title, detail) => push("error", title, detail),
      fromError: (error, fallback = "Something went wrong") => {
        if (error instanceof ApiError) {
          push("error", error.title || fallback, error.message);
        } else {
          push("error", fallback, error instanceof Error ? error.message : undefined);
        }
      },
    }),
    [push],
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
              toast.tone === "error" && "border-destructive/40",
            )}
          >
            <ToneIcon tone={toast.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.detail && (
                <p className="text-muted-foreground mt-0.5 text-sm">{toast.detail}</p>
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
