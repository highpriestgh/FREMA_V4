import { useState } from "react";
import { Copy, Pencil, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/ui/toast";
import { TableRowsSkeleton } from "@/components/layout/PageSkeletons";
import type { PagedResult, ReferenceItem } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface User {
  id: string;
  userName: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  departmentId: string | null;
  department: string | null;
  roles: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface RoleLookup {
  id: string;
  name: string;
}

type Editing = { mode: "new" } | { mode: "edit"; user: User } | null;

export function UsersPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Editing>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const query = new URLSearchParams({ page: String(page), includeInactive: String(includeInactive) });
  if (q) query.set("q", q);
  if (departmentId) query.set("departmentId", departmentId);

  const { data, initialLoading, reload } = useApi<PagedResult<User>>(`/api/users?${query}`, [q, departmentId, includeInactive, page]);
  const { data: departments } = useApi<ReferenceItem[]>("/api/departments");

  const select = "border-input bg-background h-9 rounded-md border px-3 text-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="People who can sign in, and what they are allowed to do."
        actions={
          <Button onClick={() => setEditing({ mode: "new" })}>
            <Plus className="size-4" aria-hidden />
            New user
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            className="pl-9"
            value={q}
            placeholder="Search name or email…"
            aria-label="Search users"
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className={select}
          value={departmentId}
          aria-label="Filter by department"
          onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
        >
          <option value="">All departments</option>
          {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeInactive} onChange={(e) => { setIncludeInactive(e.target.checked); setPage(1); }} />
          Include deactivated
        </label>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-40">Last sign-in</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialLoading && <TableRowsSkeleton columns={6} />}
              {data?.items.map((user) => (
                <TableRow key={user.id} className={user.isActive ? undefined : "opacity-60"}>
                  <TableCell>
                    <p className="font-medium">{user.fullName}</p>
                    <p className="text-muted-foreground text-xs">{user.email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.department ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 && <span className="text-muted-foreground text-sm">None</span>}
                      {user.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!user.isActive ? (
                      <Badge variant="outline">Deactivated</Badge>
                    ) : !user.lastLoginAt ? (
                      <Badge variant="outline">Never signed in</Badge>
                    ) : user.mustChangePassword ? (
                      <Badge variant="outline">Temporary password</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" aria-label={`Edit ${user.fullName}`} onClick={() => setEditing({ mode: "edit", user })}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">No users found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">Page {data.page} of {data.totalPages} · {data.totalCount} users</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data.hasPrevious} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {editing && (
        <UserDialog
          editing={editing}
          departments={departments ?? []}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null);
            reload();
            if (result.temporaryPassword) {
              setCreated({ email: result.email, password: result.temporaryPassword });
            } else {
              toast.success("User saved");
            }
          }}
        />
      )}

      {created && <PasswordDialog {...created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function UserDialog({
  editing,
  departments,
  onClose,
  onSaved,
}: {
  editing: NonNullable<Editing>;
  departments: ReferenceItem[];
  onClose: () => void;
  onSaved: (result: { email: string; temporaryPassword: string | null }) => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const { data: roles } = useApi<RoleLookup[]>("/api/roles/lookup");

  const existing = editing.mode === "edit" ? editing.user : null;
  const [email, setEmail] = useState(existing?.email ?? "");
  const [firstName, setFirstName] = useState(existing?.firstName ?? "");
  const [lastName, setLastName] = useState(existing?.lastName ?? "");
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? "");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(existing?.roles ?? []);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const isSelf = existing?.id === profile?.id;

  async function save() {
    setBusy(true);
    try {
      if (existing) {
        await api.put(`/api/users/${existing.id}`, {
          firstName, lastName,
          departmentId: departmentId || null,
          roles: selectedRoles,
          isActive,
        });
        onSaved({ email: existing.email, temporaryPassword: null });
      } else {
        const result = await api.post<{ user: User; temporaryPassword: string | null }>("/api/users", {
          email, firstName, lastName,
          departmentId: departmentId || null,
          roles: selectedRoles,
          password: null,
        });
        onSaved({ email: result.user.email, temporaryPassword: result.temporaryPassword });
      }
    } catch (error) {
      toast.fromError(error, "Could not save this user");
    } finally {
      setBusy(false);
    }
  }

  const toggleRole = (name: string) =>
    setSelectedRoles((current) => current.includes(name) ? current.filter((r) => r !== name) : [...current, name]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.fullName}` : "New user"}</DialogTitle>
          {!existing && (
            <DialogDescription>
              A temporary password is generated and shown to you once. They will be asked to change it when they first sign in.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={email} disabled={Boolean(existing)} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-first">First name</Label>
            <Input id="u-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-last">Last name</Label>
            <Input id="u-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="u-dept">Department</Label>
            <select id="u-dept" className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">None</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {/* Worth saying: the workflow engine files every assignment under a department. */}
            {!departmentId && (
              <p className="text-muted-foreground text-xs">Without a department this person cannot receive documents for approval.</p>
            )}
          </div>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">Roles</legend>
            <div className="flex flex-wrap gap-2 pt-1">
              {roles?.map((role) => (
                <label key={role.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={selectedRoles.includes(role.name)} onChange={() => toggleRole(role.name)} />
                  {role.name}
                </label>
              ))}
            </div>
          </fieldset>
          {existing && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={isActive} disabled={isSelf} onChange={(e) => setIsActive(e.target.checked)} />
              Account active
              {isSelf && <span className="text-muted-foreground">(you cannot deactivate yourself)</span>}
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : existing ? "Save" : "Create user"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shows a generated password exactly once. It is not stored anywhere, so closing this
 * without copying it means the account needs a reset — which is why it says so.
 */
function PasswordDialog({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const toast = useToast();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>User created</DialogTitle>
          <DialogDescription>
            Give {email} this temporary password. It is shown only now and is not stored.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted flex items-center gap-2 rounded-md p-3">
          <code className="flex-1 font-mono text-sm break-all">{password}</code>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Copy password"
            onClick={() => {
              void navigator.clipboard.writeText(password);
              toast.success("Password copied");
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
