import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/toast";
import type { ReferenceItem } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

/**
 * One screen for all three lookup tables.
 *
 * They share a shape on the server — written once against an `IReferenceEntity` contract —
 * so writing three near-identical screens here would reintroduce exactly the duplication
 * that was removed there.
 */
export function ReferenceDataPage({
  resource,
  title,
  description,
  noun,
}: {
  resource: "departments" | "document-types" | "origins";
  title: string;
  description: string;
  noun: string;
}) {
  const toast = useToast();
  const { data, reload } = useApi<ReferenceItem[]>(`/api/${resource}?includeInactive=true`, [resource]);

  const [name, setName] = useState("");
  const [describe, setDescribe] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;

    setBusy(true);
    try {
      await api.post(`/api/${resource}`, {
        name: name.trim(),
        description: describe.trim() || null,
        isActive: true,
      });
      setName("");
      setDescribe("");
      toast.success(`${noun} added`);
      reload();
    } catch (error) {
      // A duplicate name comes back as a 409 naming the conflict.
      toast.fromError(error, `Could not add that ${noun.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(item: ReferenceItem, isActive: boolean) {
    try {
      await api.put(`/api/${resource}/${item.id}`, {
        name: item.name,
        description: item.description,
        isActive,
      });
      reload();
    } catch (error) {
      toast.fromError(error);
    }
  }

  async function remove(item: ReferenceItem) {
    try {
      await api.delete(`/api/${resource}/${item.id}`);
      toast.success(`${noun} deleted`);
      reload();
    } catch (error) {
      // The server refuses to delete anything in use and explains why, so its message is
      // more useful here than anything this page could invent.
      toast.fromError(error, `Could not delete that ${noun.toLowerCase()}`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-2">
            <Label htmlFor="ref-name">Name</Label>
            <Input
              id="ref-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`New ${noun.toLowerCase()}`}
            />
          </div>
          <div className="min-w-64 flex-[2] space-y-2">
            <Label htmlFor="ref-description">Description</Label>
            <Input
              id="ref-description"
              value={describe}
              onChange={(event) => setDescribe(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? "secondary" : "outline"}>
                      {item.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void setActive(item, !item.isActive)}
                    >
                      {item.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(item)}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <p className="text-muted-foreground text-sm">
        Deactivating keeps an entry out of new pickers while leaving existing records
        untouched. Anything still in use cannot be deleted.
      </p>
    </div>
  );
}
