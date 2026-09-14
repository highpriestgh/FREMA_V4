import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import type { UserLookup } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Chooses who a document goes to next.
 *
 * Scoped to `departmentId` when the step names one — and the server enforces that same
 * constraint independently, so narrowing the list here is a convenience, not the control.
 */
export function RecipientPicker({
  departmentId,
  selected,
  onChange,
}: {
  departmentId: string | null;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [users, setUsers] = useState<UserLookup[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      void api
        .get<UserLookup[]>(
          "/api/users/lookup",
          { departmentId: departmentId ?? undefined, q: query },
          controller.signal,
        )
        .then(setUsers)
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          throw error;
        });
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [departmentId, query]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search people…"
        aria-label="Search recipients"
      />

      <div className="max-h-56 overflow-y-auto rounded-md border">
        {users.length === 0 && (
          <p className="text-muted-foreground p-3 text-sm">No matching people.</p>
        )}

        {users.map((user) => {
          const isSelected = selected.includes(user.id);

          return (
            <button
              key={user.id}
              type="button"
              onClick={() => toggle(user.id)}
              aria-pressed={isSelected}
              className={cn(
                "hover:bg-accent flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                isSelected && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded border",
                  isSelected && "bg-primary text-primary-foreground border-primary",
                )}
              >
                {isSelected && <Check className="size-3" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user.fullName}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {user.department ?? user.email}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
