/**
 * In-memory audit log for Phase 3. Replace with DB persistence when backend is ready.
 */

export type AuditEntityType =
  | "document"
  | "workflow"
  | "comment"
  | "annotation"
  | "user"
  | "folder";

export interface AuditEntry {
  id: string;
  action: string;
  entityType: AuditEntityType;
  entityId?: string;
  userId: string;
  userName: string;
  details?: string;
  timestamp: string;
}

const DEFAULT_MOCK_USER = { userId: "u1", userName: "Mark Anderson" };

/** Set by CurrentUserContext when user logs in; used by getMockCurrentUser() so audit works without passing user everywhere. */
let currentUserForAudit: { userId: string; userName: string } | null = null;

export function setCurrentUserForAudit(user: { userId: string; userName: string } | null) {
  currentUserForAudit = user;
}

export function getMockCurrentUser() {
  return currentUserForAudit ?? DEFAULT_MOCK_USER;
}

let auditLog: AuditEntry[] = [
  {
    id: "a1",
    action: "Document viewed",
    entityType: "document",
    entityId: "DOC-001",
    userId: "u1",
    userName: "John Doe",
    details: "Q3 Financial Report",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "a2",
    action: "Document routed",
    entityType: "workflow",
    entityId: "DOC-001",
    userId: "u1",
    userName: "Jane Cooper",
    details: "Routed to Finance",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "a3",
    action: "Comment added",
    entityType: "comment",
    entityId: "DOC-002",
    userId: "u2",
    userName: "Robert Fox",
    details: "Under review",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "a4",
    action: "Document approved",
    entityType: "document",
    entityId: "DOC-003",
    userId: "u1",
    userName: "Mike Jones",
    timestamp: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "a5",
    action: "Document uploaded",
    entityType: "document",
    entityId: "DOC-005",
    userId: "u3",
    userName: "Ada Mensah",
    details: "Annual Leave Policy",
    timestamp: new Date(Date.now() - 259200000).toISOString(),
  },
];

let idCounter = 100;

function nextId(): string {
  return `a${++idCounter}`;
}

export function appendAuditLog(
  entry: Omit<AuditEntry, "id" | "timestamp">
): AuditEntry {
  const full: AuditEntry = {
    ...entry,
    id: nextId(),
    timestamp: new Date().toISOString(),
  };
  auditLog.unshift(full);
  return full;
}

export interface AuditFilters {
  action?: string;
  entityType?: AuditEntityType;
  userId?: string;
  entityId?: string;
  since?: string; // ISO date
  until?: string; // ISO date
}

export function getAuditLog(filters?: AuditFilters): AuditEntry[] {
  let list = [...auditLog];
  if (!filters) return list;

  if (filters.action)
    list = list.filter((e) => e.action.toLowerCase().includes(filters.action!.toLowerCase()));
  if (filters.entityType) list = list.filter((e) => e.entityType === filters.entityType);
  if (filters.userId) list = list.filter((e) => e.userId === filters.userId);
  if (filters.entityId) list = list.filter((e) => e.entityId === filters.entityId);
  if (filters.since) list = list.filter((e) => e.timestamp >= filters.since!);
  if (filters.until) list = list.filter((e) => e.timestamp <= filters.until!);

  return list;
}
