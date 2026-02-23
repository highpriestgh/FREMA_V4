"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { MockUser } from "@/lib/users-mock";
import {
  getStoredUserId,
  setStoredUserId,
  clearStoredUser,
  getMockUserById,
  DEFAULT_MOCK_USER,
} from "@/lib/users-mock";
import { setCurrentUserForAudit } from "@/lib/audit-mock";
import { canRole, type Permission } from "@/lib/permissions-mock";

interface CurrentUserContextValue {
  user: MockUser | null;
  setUser: (user: MockUser | null) => void;
  logout: () => void;
  isLoading: boolean;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<MockUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setUser = useCallback((next: MockUser | null) => {
    setUserState(next);
    if (next) {
      setStoredUserId(next.id);
      setCurrentUserForAudit({ userId: next.id, userName: next.name });
    } else {
      clearStoredUser();
      setCurrentUserForAudit(null);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, [setUser]);

  useEffect(() => {
    const storedId = getStoredUserId();
    if (storedId) {
      const u = getMockUserById(storedId);
      if (u) {
        setUserState(u);
        setCurrentUserForAudit({ userId: u.id, userName: u.name });
      } else {
        setUserState(DEFAULT_MOCK_USER);
        setCurrentUserForAudit({ userId: DEFAULT_MOCK_USER.id, userName: DEFAULT_MOCK_USER.name });
        setStoredUserId(DEFAULT_MOCK_USER.id);
      }
    } else {
      setUserState(null);
      setCurrentUserForAudit(null);
    }
    setIsLoading(false);
  }, []);

  return (
    <CurrentUserContext.Provider
      value={{ user, setUser, logout, isLoading }}
    >
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): MockUser | null {
  const ctx = useContext(CurrentUserContext);
  return ctx?.user ?? null;
}

export function useCurrentUserOrThrow(): MockUser {
  const user = useCurrentUser();
  if (!user) throw new Error("useCurrentUserOrThrow must be used within a logged-in session");
  return user;
}

export function useCan(permission: Permission): boolean {
  const ctx = useContext(CurrentUserContext);
  const user = ctx?.user;
  if (!user) return false;
  return canRole(user.role, permission);
}

/** Returns a function to check any permission; use for filtering lists (e.g. sidebar). */
export function usePermissionCheck(): (permission: Permission) => boolean {
  const ctx = useContext(CurrentUserContext);
  const user = ctx?.user;
  return useCallback(
    (permission: Permission) => {
      if (!user) return false;
      return canRole(user.role, permission);
    },
    [user]
  );
}

export function useLogout(): () => void {
  const ctx = useContext(CurrentUserContext);
  return ctx?.logout ?? (() => {});
}

export function useSetUser(): (user: MockUser | null) => void {
  const ctx = useContext(CurrentUserContext);
  return ctx?.setUser ?? (() => {});
}
