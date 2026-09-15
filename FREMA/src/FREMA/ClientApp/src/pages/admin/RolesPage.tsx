import { useMemo, useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelSkeleton } from "@/components/layout/PageSkeletons";

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  userCount: number;
  permissions: string[];
}

interface Permission {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
}

/**
 * Roles and what each may do.
 *
 * These grants are enforced — every endpoint checks the permission, and a change reaches the
 * affected users on their next request. In the legacy system the equivalent tables only
 * decided which menu links were drawn.
 */
export function RolesPage() {
  const toast = useToast();
  const { data: roles, reload } = useApi<Role[]>("/api/roles");
  const { data: permissions } = useApi<Permission[]>("/api/permissions");

  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);

  const selected = selectedId === "new" ? null : roles?.find((r) => r.id === selectedId) ?? null;

  const byCategory = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const p of permissions ?? []) {
      groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    }
    return [...groups.entries()];
  }, [permissions]);

  async function remove(role: Role) {
    try {
      await api.delete(`/api/roles/${role.id}`);
      toast.success(`${role.name} deleted`);
      setSelectedId(null);
      reload();
    } catch (error) {
      toast.fromError(error, "Could not delete this role");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        description="Each role is a set of permissions. Users can hold several roles; they get every permission any of them grants."
        actions={
          <Button onClick={() => setSelectedId("new")}>
            <Plus className="size-4" aria-hidden />
            New role
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit p-2">
          <ul className="space-y-1">
            {roles === null &&
              Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="px-3 py-2"><Skeleton className="h-5 w-full" /></li>
              ))}
            {roles?.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(role.id)}
                  className={cn(
                    "hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm",
                    selectedId === role.id && "bg-accent",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {role.isSystemRole && <Lock className="text-muted-foreground size-3.5 shrink-0" aria-label="Built-in" />}
                    <span className="truncate font-medium">{role.name}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {role.userCount} user{role.userCount === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {selectedId !== null && permissions === null ? (
          <PanelSkeleton lines={8} />
        ) : selectedId === null ? (
          <Card className="text-muted-foreground grid place-items-center p-10 text-sm">
            Choose a role to see and change its permissions.
          </Card>
        ) : (
          <RoleEditor
            // Re-mount when switching roles so the form starts from that role's grants.
            key={selectedId}
            role={selected}
            groups={byCategory}
            onSaved={(id) => {
              reload();
              setSelectedId(id);
            }}
            onDelete={selected && !selected.isSystemRole ? () => void remove(selected) : undefined}
          />
        )}
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  groups,
  onSaved,
  onDelete,
}: {
  role: Role | null;
  groups: [string, Permission[]][];
  onSaved: (id: string) => void;
  onDelete?: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [granted, setGranted] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);

  const toggle = (permission: string) =>
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });

  const toggleGroup = (items: Permission[], on: boolean) =>
    setGranted((current) => {
      const next = new Set(current);
      for (const p of items) {
        if (on) next.add(p.name);
        else next.delete(p.name);
      }
      return next;
    });

  async function save() {
    setBusy(true);
    try {
      const body = { name, description: description || null, permissions: [...granted] };
      const saved = role
        ? await api.put<Role>(`/api/roles/${role.id}`, body)
        : await api.post<Role>("/api/roles", body);

      toast.success(
        "Role saved",
        role && role.userCount > 0
          ? `Applies to ${role.userCount} user${role.userCount === 1 ? "" : "s"} on their next request.`
          : undefined,
      );
      onSaved(saved.id);
    } catch (error) {
      toast.fromError(error, "Could not save this role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{role ? role.name : "New role"}</CardTitle>
          {role?.isSystemRole && <Badge variant="outline">Built-in</Badge>}
        </div>
        <div className="flex gap-2">
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete} disabled={(role?.userCount ?? 0) > 0}>
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              // Built-in role names are fixed: the seeder matches on them.
              disabled={role?.isSystemRole}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Description</Label>
            <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        {role && role.userCount > 0 && onDelete && (
          <p className="text-muted-foreground text-xs">
            Reassign this role's {role.userCount} user{role.userCount === 1 ? "" : "s"} before deleting it.
          </p>
        )}

        {groups.map(([category, items]) => {
          const all = items.every((p) => granted.has(p.name));

          return (
            <fieldset key={category} className="space-y-2">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">{category}</legend>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs"
                  onClick={() => toggleGroup(items, !all)}
                >
                  {all ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <label key={p.name} className="hover:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={granted.has(p.name)}
                      onChange={() => toggle(p.name)}
                    />
                    <span>
                      <span className="block font-medium">{p.displayName}</span>
                      <span className="text-muted-foreground block font-mono text-xs">{p.name}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </CardContent>
    </Card>
  );
}
