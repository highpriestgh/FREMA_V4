import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, login } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { ShellSkeleton } from "@/components/layout/PageSkeletons";

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  /** Ends the BFF session. The URL comes from the server's claims, not from here. */
  signOut: () => void;
  /** True when the signed-in user holds the given permission. */
  can: (permission: string) => boolean;
  /** Re-reads the profile, e.g. after an administrator changes the user's roles. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** One claim as the BFF's /bff/user endpoint returns it. */
interface Claim {
  type: string;
  value: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logoutUrl, setLogoutUrl] = useState<string>("/bff/logout");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      // /bff/user answers "is there a session", and carries the logout URL with its
      // required session id. The richer profile comes from the application's own endpoint.
      const claims = await api.get<Claim[]>("/bff/user");

      const logout = claims.find((c) => c.type === "bff:logout_url")?.value;
      if (logout) setLogoutUrl(logout);

      setProfile(await api.get<Profile>("/api/users/me"));
    } catch (error) {
      // A 401 here is the ordinary signed-out case, not a failure worth surfacing.
      if (error instanceof ApiError && error.isUnauthenticated) {
        setProfile(null);
      } else {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const value: AuthState = {
    profile,
    loading,
    signOut: () => {
      window.location.href = logoutUrl;
    },
    // Permissions come from the server's claims, so what the UI offers and what the API
    // allows cannot disagree. The prototype kept a hardcoded role-to-permission map in the
    // browser, which meant the two could — and the server enforced neither.
    can: (permission) => profile?.permissions.includes(permission) ?? false,
    refresh: load,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }
  return context;
}

/** Convenience for the common `can(...)` check. */
export function useCan(permission: string) {
  return useAuth().can(permission);
}

/**
 * Gate for the authenticated area. Sends the browser to the identity provider when there is
 * no session, preserving where the user was trying to go.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !profile) {
      login(window.location.pathname + window.location.search);
    }
  }, [loading, profile]);

  // Shaped like the app itself, so the first paint does not jump when the session is confirmed.
  if (loading) {
    return <ShellSkeleton />;
  }

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-muted-foreground text-sm">Redirecting to sign in…</p>
      </div>
    );
  }

  return <>{children}</>;
}
