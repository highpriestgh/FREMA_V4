/**
 * Placeholder for scanner SDK / local helper. Triggers scan via /api/scan or env-configured URL.
 * In production this would integrate with a native helper or device API.
 */

const SCAN_API = process.env.NEXT_PUBLIC_SCAN_API_URL ?? "/api/scan";

export interface TriggerScanResult {
  ok: boolean;
  file?: File;
  error?: string;
}

/**
 * Trigger a scan from the connected printer/scanner. Calls the scan API and returns the scanned image as a File.
 * Uses local helper placeholder or /api/scan mock.
 */
export async function triggerScan(): Promise<TriggerScanResult> {
  try {
    const res = await fetch(SCAN_API, { method: "POST" });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || `Scan failed: ${res.status}` };
    }
    const blob = await res.blob();
    const file = new File([blob], `scanned-${Date.now()}.png`, { type: blob.type || "image/png" });
    return { ok: true, file };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/**
 * Optional: process a scanned image (e.g. crop, deskew). Placeholder for future use.
 */
export function processScannedImage(file: File): Promise<File> {
  return Promise.resolve(file);
}
