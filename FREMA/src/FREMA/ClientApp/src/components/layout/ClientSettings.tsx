import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

export interface ClientSettings {
  organisationName: string;
  logoUrl: string | null;
  allowedExtensions: string[];
  maxUploadBytes: number;
}

interface ClientSettingsState {
  settings: ClientSettings | null;
  /** Re-read after an administrator changes Settings, so the change shows without a reload. */
  refresh: () => Promise<void>;
}

const Context = createContext<ClientSettingsState | null>(null);

/**
 * Branding and upload rules, read once per session and shared by every page.
 * The server enforces the upload rules regardless; the client uses them to set file pickers
 * and to warn before a large upload starts rather than after it fails.
 */
export function ClientSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ClientSettings | null>(null);

  const refresh = useCallback(async () => {
    setSettings(await api.get<ClientSettings>("/api/settings/client"));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (settings) document.title = settings.organisationName;
  }, [settings]);

  return <Context.Provider value={{ settings, refresh }}>{children}</Context.Provider>;
}

export function useClientSettings() {
  const context = useContext(Context);
  if (!context) throw new Error("useClientSettings must be used inside a ClientSettingsProvider.");
  return context;
}

/** Checks a file against the upload rules; returns a message, or null when it is acceptable. */
export function checkUpload(file: File, settings: ClientSettings | null): string | null {
  if (!settings) return null;

  const dot = file.name.lastIndexOf(".");
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";

  if (!settings.allowedExtensions.includes(extension)) {
    return `Files of type "${extension || "none"}" are not accepted. Allowed: ${settings.allowedExtensions.join(", ")}`;
  }

  if (file.size > settings.maxUploadBytes) {
    return `This file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${Math.floor(settings.maxUploadBytes / 1048576)} MB.`;
  }

  return null;
}
