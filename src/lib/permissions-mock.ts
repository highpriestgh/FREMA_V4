/**
 * Permission set and role → permissions map for Option A (mock auth).
 * Aligns with admin Roles UI; used by useCan() to gate UI.
 */

export const PERMISSIONS = {
  VIEW_DOCS: "VIEW_DOCS",
  UPLOAD_DOCS: "UPLOAD_DOCS",
  APPROVE_DOCS: "APPROVE_DOCS",
  ROUTE_DOCS: "ROUTE_DOCS",
  VIEW_REPORTS: "VIEW_REPORTS",
  VIEW_AUDIT: "VIEW_AUDIT",
  MANAGE_USERS: "MANAGE_USERS",
  MANAGE_ROLES: "MANAGE_ROLES",
  MANAGE_ORIGINS: "MANAGE_ORIGINS",
  MANAGE_TYPES: "MANAGE_TYPES",
  ALL_ACCESS: "ALL_ACCESS",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Role name must match admin users/roles and mock users. */
const roleToPermissions: Record<string, Permission[]> = {
  Administrator: [PERMISSIONS.ALL_ACCESS],
  Manager: [
    PERMISSIONS.VIEW_DOCS,
    PERMISSIONS.APPROVE_DOCS,
    PERMISSIONS.ROUTE_DOCS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_AUDIT,
  ],
  "Record Officer": [
    PERMISSIONS.VIEW_DOCS,
    PERMISSIONS.UPLOAD_DOCS,
    PERMISSIONS.ROUTE_DOCS,
  ],
  Editor: [
    PERMISSIONS.VIEW_DOCS,
    PERMISSIONS.UPLOAD_DOCS,
    PERMISSIONS.VIEW_REPORTS,
  ],
  Viewer: [PERMISSIONS.VIEW_DOCS],
};

/** Resolve ALL_ACCESS to every permission for convenience. */
const allPermissions: Permission[] = Object.values(PERMISSIONS).filter(
  (p) => p !== PERMISSIONS.ALL_ACCESS
);

export function getPermissionsForRole(role: string): Permission[] {
  const list = roleToPermissions[role];
  if (!list) return [];
  if (list.includes(PERMISSIONS.ALL_ACCESS)) return allPermissions;
  return list;
}

export function canRole(role: string, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}
