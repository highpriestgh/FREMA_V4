import { useEffect, useState } from "react";
import { useIsLoading } from "@/lib/loading";

/** Requests quicker than this never show the bar, so fast pages do not flicker. */
const SHOW_AFTER_MS = 150;
/** Once shown, stay long enough to register rather than flashing. */
const MIN_VISIBLE_MS = 300;

/**
 * A thin progress bar across the top of the window while the app is waiting on the server —
 * changing page, saving, uploading. The progress is indeterminate: requests do not report how
 * far along they are.
 */
export function TopLoader() {
  const loading = useIsLoading();
  const [visible, setVisible] = useState(false);
  const [shownAt, setShownAt] = useState(0);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setVisible(true);
        setShownAt(Date.now());
      }, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }

    if (visible) {
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
      const timer = setTimeout(() => setVisible(false), remaining);
      return () => clearTimeout(timer);
    }
  }, [loading, visible, shownAt]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
      role="progressbar"
      aria-label="Loading"
      aria-hidden={!visible}
    >
      <div className="top-loader-bar bg-primary h-full" />
    </div>
  );
}
