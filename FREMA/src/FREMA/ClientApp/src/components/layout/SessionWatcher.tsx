import { useEffect, useRef } from "react";
import { login, SESSION_EXPIRED_EVENT } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

/**
 * Tells the user when their session has ended while a page is open.
 *
 * It does not redirect on its own: the user may be halfway through a form, and sending them to
 * the sign-in page without warning would throw that away. Instead a message stays on screen
 * with a way to sign in again when they are ready.
 */
export function SessionWatcher() {
  const toast = useToast();
  const announced = useRef(false);

  useEffect(() => {
    const onExpired = () => {
      // Several requests usually fail together; one message is enough.
      if (announced.current) return;
      announced.current = true;

      toast.show({
        tone: "info",
        title: "Your session has ended",
        detail: "Sign in again to continue. Copy anything you were typing first — it will not be kept.",
        persistent: true,
        action: {
          label: "Sign in again",
          onClick: () => login(window.location.pathname + window.location.search),
        },
      });
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [toast]);

  return null;
}
