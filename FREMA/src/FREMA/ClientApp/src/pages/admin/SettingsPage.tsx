import { useEffect, useRef, useState } from "react";
import { BellRing, ImageUp, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/toast";
import { useClientSettings } from "@/components/layout/ClientSettings";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSkeleton } from "@/components/layout/PageSkeletons";

interface Settings {
  organisationName: string;
  hasLogo: boolean;
  logoUrl: string | null;
  numberPrefix: string;
  numberIncludesYear: boolean;
  numberDigits: number;
  numberResetsYearly: boolean;
  nextNumber: string;
  defaultDueDays: number | null;
  remindersEnabled: boolean;
  reminderDueSoonHours: number;
  reminderRepeatHours: number;
  allowedExtensions: string[];
  recognisedExtensions: string[];
  maxUploadMegabytes: number;
  maxUploadMegabytesCeiling: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

type Form = Omit<Settings, "hasLogo" | "logoUrl" | "nextNumber" | "recognisedExtensions" | "maxUploadMegabytesCeiling" | "updatedAt" | "updatedBy">;

function toForm(s: Settings): Form {
  return {
    organisationName: s.organisationName,
    numberPrefix: s.numberPrefix,
    numberIncludesYear: s.numberIncludesYear,
    numberDigits: s.numberDigits,
    numberResetsYearly: s.numberResetsYearly,
    defaultDueDays: s.defaultDueDays,
    remindersEnabled: s.remindersEnabled,
    reminderDueSoonHours: s.reminderDueSoonHours,
    reminderRepeatHours: s.reminderRepeatHours,
    allowedExtensions: s.allowedExtensions,
    maxUploadMegabytes: s.maxUploadMegabytes,
  };
}

/** Mirrors the server's formatting, for a live preview while editing. */
function previewNumber(f: Form, serverNext: string) {
  // The running value comes from the server's preview; only the format is recomputed here.
  const running = Number(serverNext.split("-").pop()) || 1;
  const padded = String(running).padStart(f.numberDigits || 1, "0");
  const prefix = (f.numberPrefix || "?").toUpperCase();
  return f.numberIncludesYear ? `${prefix}-${new Date().getFullYear()}-${padded}` : `${prefix}-${padded}`;
}

export function SettingsPage() {
  const toast = useToast();
  const { refresh: refreshClient } = useClientSettings();
  const { data, reload } = useApi<Settings>("/api/settings");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  // The form is filled once, then only replaced by what an explicit save returns. Re-filling it
  // on every reload would wipe unsaved edits — the logo uploads immediately and reloads the
  // page data, which silently discarded any other changes still being made.
  useEffect(() => {
    if (data && !form) setForm(toForm(data));
  }, [data, form]);

  if (!data || !form) {
    return <FormSkeleton sections={4} />;
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const toggleExtension = (ext: string) =>
    set("allowedExtensions", form.allowedExtensions.includes(ext)
      ? form.allowedExtensions.filter((e) => e !== ext)
      : [...form.allowedExtensions, ext]);

  async function save() {
    setBusy(true);
    try {
      const saved = await api.put<Settings>("/api/settings", form);
      setForm(toForm(saved));
      toast.success("Settings saved");
      reload();
      await refreshClient();
    } catch (error) {
      toast.fromError(error, "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File) {
    try {
      await api.upload("/api/settings/logo", file);
      toast.success("Logo updated");
      reload();
      await refreshClient();
    } catch (error) {
      toast.fromError(error, "Could not use that image");
    } finally {
      if (logoInput.current) logoInput.current.value = "";
    }
  }

  async function removeLogo() {
    try {
      await api.delete("/api/settings/logo");
      toast.success("Logo removed");
      reload();
      await refreshClient();
    } catch (error) {
      toast.fromError(error);
    }
  }

  async function runReminders() {
    try {
      const result = await api.post<{ dueSoon: number; overdue: number; enabled: boolean }>("/api/settings/reminders/run");
      if (!result.enabled) {
        toast.info("Reminders are switched off", "Turn them on and save before sending.");
      } else {
        toast.success("Reminders sent", `${result.dueSoon} due soon · ${result.overdue} overdue`);
      }
    } catch (error) {
      toast.fromError(error);
    }
  }

  const numberInput = (key: "numberDigits" | "reminderDueSoonHours" | "reminderRepeatHours" | "maxUploadMegabytes", min: number, max: number) => (
    <Input
      id={key}
      type="number"
      min={min}
      max={max}
      value={form[key]}
      onChange={(e) => set(key, Number(e.target.value))}
      className="w-28"
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={
          data.updatedAt
            ? `Last changed ${new Date(data.updatedAt).toLocaleString()}${data.updatedBy ? ` by ${data.updatedBy}` : ""}.`
            : "Organisation-wide settings."
        }
        actions={<Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save settings"}</Button>}
      />

      {/* --- Organisation --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organisation</CardTitle>
          <CardDescription>Shown in the sidebar and on the sign-in page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="organisationName">Name</Label>
            <Input id="organisationName" value={form.organisationName} onChange={(e) => set("organisationName", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <div className="bg-muted grid h-14 w-28 place-items-center overflow-hidden rounded-md border">
                {data.logoUrl
                  ? <img src={data.logoUrl} alt="Current logo" className="max-h-12 max-w-24 object-contain" />
                  : <span className="text-muted-foreground text-xs">No logo</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => logoInput.current?.click()}>
                <ImageUp className="size-4" aria-hidden />
                {data.hasLogo ? "Replace" : "Upload"}
              </Button>
              {data.hasLogo && (
                <Button variant="ghost" size="sm" onClick={() => void removeLogo()} aria-label="Remove logo">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">PNG, JPEG or WebP, up to 512 KB. Uploads immediately.</p>
            <input
              ref={logoInput}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* --- Numbering --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document numbering</CardTitle>
          <CardDescription>
            Numbers are issued in sequence as documents are registered. None are skipped, and none are reused.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <Label htmlFor="numberPrefix">Prefix</Label>
              <Input
                id="numberPrefix"
                value={form.numberPrefix}
                maxLength={10}
                onChange={(e) => set("numberPrefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                className="w-28 font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numberDigits">Digits</Label>
              {numberInput("numberDigits", 3, 10)}
            </div>
            <div className="space-y-2 pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.numberIncludesYear} onChange={(e) => set("numberIncludesYear", e.target.checked)} />
                Include the year
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.numberResetsYearly} onChange={(e) => set("numberResetsYearly", e.target.checked)} />
                Start again at 1 each year
              </label>
            </div>
          </div>

          <div className="bg-muted rounded-md p-3 text-sm">
            <span className="text-muted-foreground">Next document will be </span>
            <span className="font-mono font-medium">{previewNumber(form, data.nextNumber)}</span>
          </div>

          {/* Worth saying plainly: without the year, numbers from different years would collide. */}
          {form.numberResetsYearly && !form.numberIncludesYear && (
            <p className="text-sm text-amber-700 dark:text-amber-500">
              Restarting each year without the year in the number means next year&apos;s numbers repeat this year&apos;s.
              Each document still gets a unique number, because any number already in use is skipped, but the register will be confusing.
            </p>
          )}
        </CardContent>
      </Card>

      {/* --- Deadlines and reminders --- */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Deadlines and reminders</CardTitle>
            <CardDescription>Reminders appear under the bell for the person a document is waiting on.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void runReminders()}>
            <BellRing className="size-4" aria-hidden />
            Send reminders now
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="defaultDueDays">Default deadline for steps without one</Label>
            <div className="flex items-center gap-3">
              <Input
                id="defaultDueDays"
                type="number"
                min={1}
                max={365}
                value={form.defaultDueDays ?? ""}
                placeholder="None"
                onChange={(e) => set("defaultDueDays", e.target.value ? Number(e.target.value) : null)}
                className="w-28"
              />
              <span className="text-muted-foreground text-sm">days · leave empty for no deadline</span>
            </div>
            <p className="text-muted-foreground text-xs">Applies to documents routed from now on; existing deadlines are not changed.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.remindersEnabled} onChange={(e) => set("remindersEnabled", e.target.checked)} />
            Send reminders
          </label>

          <div className={form.remindersEnabled ? "flex flex-wrap gap-6" : "pointer-events-none flex flex-wrap gap-6 opacity-50"}>
            <div className="space-y-2">
              <Label htmlFor="reminderDueSoonHours">Remind before the deadline</Label>
              <div className="flex items-center gap-2">{numberInput("reminderDueSoonHours", 1, 720)}<span className="text-muted-foreground text-sm">hours</span></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminderRepeatHours">Once overdue, remind every</Label>
              <div className="flex items-center gap-2">{numberInput("reminderRepeatHours", 1, 720)}<span className="text-muted-foreground text-sm">hours</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- Uploads --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">File uploads</CardTitle>
          <CardDescription>
            Only types the server can verify from the file contents are listed. The size limit cannot exceed {data.maxUploadMegabytesCeiling} MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Allowed file types</legend>
            <div className="flex flex-wrap gap-2">
              {data.recognisedExtensions.map((ext) => (
                <label key={ext} className="flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm">
                  <input type="checkbox" checked={form.allowedExtensions.includes(ext)} onChange={() => toggleExtension(ext)} />
                  {ext}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="maxUploadMegabytes">Maximum file size</Label>
            <div className="flex items-center gap-2">{numberInput("maxUploadMegabytes", 1, data.maxUploadMegabytesCeiling)}<span className="text-muted-foreground text-sm">MB</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save settings"}</Button>
      </div>
    </div>
  );
}
