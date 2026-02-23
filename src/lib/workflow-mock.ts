/**
 * Shared mock data and types for workflow routing.
 * Used by WorkflowRoutingForm and workflow/inbox pages until backend is connected.
 */

export interface Department {
  id: string;
  name: string;
}

export interface UserWithDepartment {
  id: string;
  name: string;
  email: string;
  departmentId: string;
}

export interface RoutingEntry {
  departmentId: string;
  departmentName: string;
  userId: string;
  userName: string;
  priority: string;
  note?: string;
  routedAt?: string;
}

export type RoutingPayload = Omit<RoutingEntry, "routedAt">;

export const departments: Department[] = [
  { id: "finance", name: "Finance" },
  { id: "legal", name: "Legal" },
  { id: "hr", name: "Human Resources" },
  { id: "operations", name: "Operations" },
  { id: "it", name: "Information Technology" },
  { id: "executive", name: "Executive Office" },
];

export const usersWithDepartment: UserWithDepartment[] = [
  { id: "u1", name: "John Doe", email: "john@example.com", departmentId: "finance" },
  { id: "u2", name: "Jane Smith", email: "jane@example.com", departmentId: "finance" },
  { id: "u3", name: "Emily Davis", email: "emily@example.com", departmentId: "legal" },
  { id: "u4", name: "Robert Fox", email: "robert@example.com", departmentId: "legal" },
  { id: "u5", name: "Sarah Wilson", email: "sarah@example.com", departmentId: "hr" },
  { id: "u6", name: "Michael Brown", email: "mike@example.com", departmentId: "hr" },
  { id: "u7", name: "David Lee", email: "david@example.com", departmentId: "operations" },
  { id: "u8", name: "Ama Boateng", email: "ama@example.com", departmentId: "operations" },
  { id: "u9", name: "Kwame Asante", email: "kwame@example.com", departmentId: "it" },
  { id: "u10", name: "Ada Mensah", email: "ada@example.com", departmentId: "it" },
  { id: "u11", name: "Dave Ofori", email: "dave@example.com", departmentId: "executive" },
  { id: "u12", name: "Lisa Akoto", email: "lisa@example.com", departmentId: "executive" },
];

export function getUsersByDepartment(departmentId: string): UserWithDepartment[] {
  return usersWithDepartment.filter((u) => u.departmentId === departmentId);
}

export function createRoutingEntry(
  payload: RoutingPayload
): RoutingEntry {
  return {
    ...payload,
    routedAt: new Date().toISOString(),
  };
}
