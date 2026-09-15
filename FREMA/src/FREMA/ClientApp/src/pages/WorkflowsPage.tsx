import { useState } from "react";
import {
  ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Star, Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Permission, Priority, priorityLabel, type ReferenceItem, type UserLookup } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CardListSkeleton } from "@/components/layout/PageSkeletons";

// --- Contracts ---------------------------------------------------------------

const AssignmentMode = { Department: 0, Role: 1, User: 2, ChosenAtRuntime: 3 } as const;
type AssignmentMode = (typeof AssignmentMode)[keyof typeof AssignmentMode];

const CompletionPolicy = { AnyOne: 0, Unanimous: 1 } as const;
type CompletionPolicy = (typeof CompletionPolicy)[keyof typeof CompletionPolicy];

const modeLabel: Record<AssignmentMode, string> = {
  [AssignmentMode.ChosenAtRuntime]: "Chosen when routing",
  [AssignmentMode.Department]: "Everyone in a department",
  [AssignmentMode.Role]: "Everyone with a role",
  [AssignmentMode.User]: "A specific person",
};

interface Step {
  id?: string;
  order?: number;
  name: string;
  instructions: string | null;
  assignmentMode: AssignmentMode;
  departmentId: string | null;
  department?: string | null;
  roleId: string | null;
  role?: string | null;
  assigneeId: string | null;
  assignee?: string | null;
  completionPolicy: CompletionPolicy;
  isReviewOnly: boolean;
  dueAfterDays: number | null;
  defaultPriority: Priority;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  isDefault: boolean;
  documentTypeId: string | null;
  documentType: string | null;
  originatingDepartmentId: string | null;
  originatingDepartment: string | null;
  documentCount: number;
  steps: Step[];
}

interface Role {
  id: string;
  name: string;
}

const blankStep = (): Step => ({
  name: "",
  instructions: null,
  assignmentMode: AssignmentMode.ChosenAtRuntime,
  departmentId: null,
  roleId: null,
  assigneeId: null,
  completionPolicy: CompletionPolicy.AnyOne,
  isReviewOnly: false,
  dueAfterDays: 3,
  defaultPriority: Priority.Normal,
});

// --- Page --------------------------------------------------------------------

/**
 * Approval routes. Everyone who routes documents can read them; only holders of
 * `admin.settings` can change them — the same split the server enforces.
 */
export function WorkflowsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can(Permission.ManageSettings);

  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<Workflow | "new" | null>(null);

  const { data, initialLoading, reload } = useApi<Workflow[]>(
    `/api/workflows?includeInactive=${showRetired}`,
    [showRetired],
  );

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
      reload();
    } catch (error) {
      toast.fromError(error);
    }
  }

  if (editing) {
    return (
      <WorkflowEditor
        workflow={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval routes"
        description="The steps a document passes through. The most specific active route for a document's type and department is used; the default catches everything else."
        actions={
          editable && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden />
              New route
            </Button>
          )
        }
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showRetired}
          onChange={(event) => setShowRetired(event.target.checked)}
        />
        Show retired versions
      </label>

      <div className="space-y-4">
        {initialLoading && <CardListSkeleton count={2} />}
        {data?.map((workflow) => (
          <Card key={workflow.id} className={workflow.isActive ? undefined : "opacity-60"}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {workflow.name}
                  <span className="text-muted-foreground text-xs font-normal">v{workflow.version}</span>
                  {workflow.isDefault && (
                    <Badge className="gap-1">
                      <Star className="size-3" aria-hidden />
                      Default
                    </Badge>
                  )}
                  {!workflow.isActive && <Badge variant="outline">Retired</Badge>}
                </CardTitle>
                {workflow.description && (
                  <p className="text-muted-foreground text-sm">{workflow.description}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {scopeText(workflow)} · used by {workflow.documentCount} document
                  {workflow.documentCount === 1 ? "" : "s"}
                </p>
              </div>

              {editable && (
                <div className="flex flex-wrap gap-1">
                  {workflow.isActive && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(workflow)}>
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </Button>
                  )}
                  {workflow.isActive && !workflow.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void run(
                          () => api.post(`/api/workflows/${workflow.id}/default`),
                          `${workflow.name} is now the default`,
                        )
                      }
                    >
                      <CheckCircle2 className="size-4" aria-hidden />
                      Make default
                    </Button>
                  )}
                  {/* A version superseded by a newer one stays retired: reactivating it would
                      put two live versions of the same route side by side. */}
                  {(workflow.isActive ||
                    !data.some((w) => w.name === workflow.name && w.version > workflow.version)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void run(
                          () => api.post(`/api/workflows/${workflow.id}/active`, undefined, { active: !workflow.isActive }),
                          workflow.isActive ? "Route deactivated" : "Route activated",
                        )
                      }
                    >
                      {workflow.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                  {workflow.documentCount === 0 && !workflow.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${workflow.name}`}
                      onClick={() =>
                        void run(() => api.delete(`/api/workflows/${workflow.id}`), "Route deleted")
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              )}
            </CardHeader>

            <CardContent>
              <ol className="flex flex-wrap items-center gap-2">
                {workflow.steps.map((step, index) => (
                  <li key={step.id ?? index} className="flex items-center gap-2">
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-sm font-medium">
                        <span className="text-muted-foreground mr-1.5">{step.order ?? index + 1}.</span>
                        {step.name}
                      </p>
                      <p className="text-muted-foreground text-xs">{assigneeText(step)}</p>
                    </div>
                    {index < workflow.steps.length - 1 && (
                      <span className="text-muted-foreground" aria-hidden>→</span>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function scopeText(w: Workflow) {
  const parts = [
    w.documentType && `${w.documentType} documents`,
    w.originatingDepartment && `raised by ${w.originatingDepartment}`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Any document";
}

function assigneeText(step: Step) {
  const policy = step.completionPolicy === CompletionPolicy.Unanimous ? " · all must approve" : "";
  const review = step.isReviewOnly ? " · review only" : "";
  const due = step.dueAfterDays ? ` · ${step.dueAfterDays}d` : "";

  const who = (() => {
    switch (step.assignmentMode) {
      case AssignmentMode.Department: return step.department ?? "a department";
      case AssignmentMode.Role: return step.role ?? "a role";
      case AssignmentMode.User: return step.assignee ?? "a person";
      default: return step.department ? `chosen from ${step.department}` : "chosen when routing";
    }
  })();

  return `${who}${policy}${review}${due}`;
}

// --- Editor ------------------------------------------------------------------

function WorkflowEditor({
  workflow,
  onCancel,
  onSaved,
}: {
  workflow: Workflow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { data: types } = useApi<ReferenceItem[]>("/api/document-types");
  const { data: departments } = useApi<ReferenceItem[]>("/api/departments");
  const { data: roles } = useApi<Role[]>("/api/roles/lookup");
  const { data: people } = useApi<UserLookup[]>("/api/users/lookup");

  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [documentTypeId, setDocumentTypeId] = useState(workflow?.documentTypeId ?? "");
  const [departmentId, setDepartmentId] = useState(workflow?.originatingDepartmentId ?? "");
  const [steps, setSteps] = useState<Step[]>(workflow?.steps.map((s) => ({ ...s })) ?? [blankStep()]);
  const [busy, setBusy] = useState(false);

  const update = (index: number, patch: Partial<Step>) =>
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const move = (index: number, by: -1 | 1) =>
    setSteps((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  async function save() {
    setBusy(true);
    try {
      const body = {
        name,
        description: description || null,
        documentTypeId: documentTypeId || null,
        originatingDepartmentId: departmentId || null,
        steps: steps.map((s) => ({
          name: s.name,
          instructions: s.instructions || null,
          assignmentMode: s.assignmentMode,
          departmentId: s.departmentId,
          roleId: s.roleId,
          assigneeId: s.assigneeId,
          completionPolicy: s.completionPolicy,
          isReviewOnly: s.isReviewOnly,
          dueAfterDays: s.dueAfterDays,
          defaultPriority: s.defaultPriority,
        })),
      };

      const saved = workflow
        ? await api.put<Workflow>(`/api/workflows/${workflow.id}`, body)
        : await api.post<Workflow>("/api/workflows", body);

      toast.success(
        workflow && saved.id !== workflow.id
          ? `Saved as version ${saved.version}`
          : "Route saved",
        workflow && saved.id !== workflow.id
          ? `Documents already on version ${workflow.version} will finish on it.`
          : undefined,
      );
      onSaved();
    } catch (error) {
      // Validation names the offending step, e.g. "Step 2 ('Finance') assigns to a
      // department, but none is chosen" — worth showing verbatim.
      toast.fromError(error, "Could not save this route");
    } finally {
      setBusy(false);
    }
  }

  const select = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        title={workflow ? `Edit ${workflow.name}` : "New route"}
        actions={
          <>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save route"}
            </Button>
          </>
        }
      />

      {/* Said up front, because it changes what "save" means. */}
      {workflow && workflow.documentCount > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-500">
            This route has been used by {workflow.documentCount} document
            {workflow.documentCount === 1 ? "" : "s"}.
          </p>
          <p className="mt-0.5">
            Saving creates version {workflow.version + 1} for new documents. Documents already on
            version {workflow.version} finish on it unchanged, so their history stays accurate.
          </p>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Route</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="wf-name">Name</Label>
            <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="wf-description">Description</Label>
            <Textarea id="wf-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-type">Applies to document type</Label>
            <select id="wf-type" className={select} value={documentTypeId} onChange={(e) => setDocumentTypeId(e.target.value)}>
              <option value="">Any type</option>
              {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-dept">Applies to documents raised by</Label>
            <select id="wf-dept" className={select} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Any department</option>
              {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Step {index + 1}</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={index === steps.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={steps.length === 1}
                  onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
                  aria-label="Remove step"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={step.name} placeholder="e.g. Head of Department" onChange={(e) => update(index, { name: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Who acts</Label>
                <select
                  className={select}
                  value={step.assignmentMode}
                  onChange={(e) => update(index, { assignmentMode: Number(e.target.value) as AssignmentMode })}
                >
                  {Object.entries(modeLabel).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {(step.assignmentMode === AssignmentMode.Department ||
                step.assignmentMode === AssignmentMode.ChosenAtRuntime) && (
                <div className="space-y-2">
                  <Label>
                    {step.assignmentMode === AssignmentMode.Department ? "Department" : "Limit choice to department"}
                  </Label>
                  <select
                    className={select}
                    value={step.departmentId ?? ""}
                    onChange={(e) => update(index, { departmentId: e.target.value || null })}
                  >
                    <option value="">
                      {step.assignmentMode === AssignmentMode.Department ? "Choose…" : "Anyone"}
                    </option>
                    {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              {step.assignmentMode === AssignmentMode.Role && (
                <div className="space-y-2">
                  <Label>Role</Label>
                  <select className={select} value={step.roleId ?? ""} onChange={(e) => update(index, { roleId: e.target.value || null })}>
                    <option value="">Choose…</option>
                    {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}

              {step.assignmentMode === AssignmentMode.User && (
                <div className="space-y-2">
                  <Label>Person</Label>
                  <select className={select} value={step.assigneeId ?? ""} onChange={(e) => update(index, { assigneeId: e.target.value || null })}>
                    <option value="">Choose…</option>
                    {people?.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                </div>
              )}

              {step.assignmentMode !== AssignmentMode.User && (
                <div className="space-y-2">
                  <Label>When several people receive it</Label>
                  <select
                    className={select}
                    value={step.completionPolicy}
                    onChange={(e) => update(index, { completionPolicy: Number(e.target.value) as CompletionPolicy })}
                  >
                    <option value={CompletionPolicy.AnyOne}>The first decision counts</option>
                    <option value={CompletionPolicy.Unanimous}>Everyone must approve</option>
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Due within (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={step.dueAfterDays ?? ""}
                  placeholder="No deadline"
                  onChange={(e) => update(index, { dueAfterDays: e.target.value ? Number(e.target.value) : null })}
                />
              </div>

              <div className="space-y-2">
                <Label>Default priority</Label>
                <select
                  className={select}
                  value={step.defaultPriority}
                  onChange={(e) => update(index, { defaultPriority: Number(e.target.value) as Priority })}
                >
                  {Object.entries(priorityLabel).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Instructions</Label>
                <Textarea
                  rows={2}
                  value={step.instructions ?? ""}
                  placeholder="What should the person at this step check?"
                  onChange={(e) => update(index, { instructions: e.target.value || null })}
                />
              </div>

              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={step.isReviewOnly}
                  onChange={(e) => update(index, { isReviewOnly: e.target.checked })}
                />
                Review only — acknowledges the document but cannot send it back
              </label>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" onClick={() => setSteps((current) => [...current, blankStep()])}>
          <Plus className="size-4" aria-hidden />
          Add step
        </Button>
      </div>
    </div>
  );
}
