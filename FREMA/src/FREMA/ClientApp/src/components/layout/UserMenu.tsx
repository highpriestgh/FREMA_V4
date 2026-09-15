import { ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** The signed-in user, with sign-out, in the header. */
export function UserMenu() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-accent focus-visible:ring-ring flex items-center gap-2 rounded-md py-1 pr-2 pl-1 text-left outline-none focus-visible:ring-2"
        aria-label={`Account: ${profile.fullName}`}
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-blue-600/10 text-xs font-semibold text-blue-700 dark:text-blue-400">
            {initials(profile.fullName)}
          </AvatarFallback>
        </Avatar>
        {/* Name and department beside the avatar on wider screens; avatar alone on phones. */}
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block max-w-40 truncate text-sm font-medium">{profile.fullName}</span>
          <span className="text-muted-foreground block max-w-40 truncate text-xs">
            {profile.department ?? profile.email}
          </span>
        </span>
        <ChevronDown className="text-muted-foreground hidden size-4 sm:block" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{profile.fullName}</p>
          <p className="text-muted-foreground truncate text-xs">{profile.email}</p>
          {profile.roles.length > 0 && (
            <p className="text-muted-foreground mt-1 truncate text-xs">{profile.roles.join(", ")}</p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} className="cursor-pointer">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
