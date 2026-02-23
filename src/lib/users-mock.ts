/**
 * Mock users for Option A. Single list for login selection and current user.
 * Roles align with admin Users/Roles pages and permissions-mock.
 */

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
}

export const MOCK_USERS: MockUser[] = [
  { id: "u1", name: "Mark Anderson", email: "mark@example.com", role: "Manager", initials: "MA" },
  { id: "u2", name: "John Doe", email: "john@example.com", role: "Administrator", initials: "JD" },
  { id: "u3", name: "Sarah Smith", email: "sarah@example.com", role: "Manager", initials: "SS" },
  { id: "u4", name: "Ada Mensah", email: "ada@example.com", role: "Record Officer", initials: "AM" },
  { id: "u5", name: "Kwame Asante", email: "kwame@example.com", role: "Record Officer", initials: "KA" },
  { id: "u6", name: "Emily Davis", email: "emily@example.com", role: "Editor", initials: "ED" },
  { id: "u7", name: "David Wilson", email: "david@example.com", role: "Viewer", initials: "DW" },
];

const STORAGE_KEY = "dms_mock_user_id";
const COOKIE_NAME = "dms_mock_user_id";

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
  const fromCookie = match ? decodeURIComponent(match[1]) : null;
  if (fromCookie) {
    localStorage.setItem(STORAGE_KEY, fromCookie);
    return fromCookie;
  }
  return null;
}

export function setStoredUserId(userId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, userId);
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(userId)};path=/;max-age=604800`; // 7 days
}

export function clearStoredUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  document.cookie = `${COOKIE_NAME}=;path=/;max-age=0`;
}

export function getMockUserById(id: string): MockUser | undefined {
  return MOCK_USERS.find((u) => u.id === id);
}

/** Default user when none is stored (e.g. first load before login). */
export const DEFAULT_MOCK_USER: MockUser = MOCK_USERS[0];
