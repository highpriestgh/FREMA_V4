/**
 * Dashboard mock data for Phase 3. Single source for stats, recent documents, and task queue.
 * Align with workflow/inbox mocks where possible.
 */

export interface RecentDocument {
  id: string;
  title: string;
  submittedBy: string;
  date: string;
  status: string;
}

export interface DashboardTask {
  documentId: string;
  title: string;
  assigneeName?: string;
  dueDate?: string;
  action: string;
}

export interface DashboardStats {
  totalDocuments: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  urgentPendingCount: number;
}

const stats: DashboardStats = {
  totalDocuments: 1284,
  pendingCount: 12,
  approvedCount: 24,
  rejectedCount: 3,
  urgentPendingCount: 3,
};

const recentDocuments: RecentDocument[] = [
  { id: "DOC-001", title: "Q3 Financial Report", submittedBy: "John Doe", date: "2024-10-24", status: "Pending" },
  { id: "DOC-002", title: "Project Alpha Plan", submittedBy: "Sarah Smith", date: "2024-10-23", status: "Pending" },
  { id: "DOC-005", title: "Annual Leave Policy", submittedBy: "Ada Mensah", date: "2024-10-25", status: "Pending" },
  { id: "DOC-006", title: "IT Security Report", submittedBy: "Kwame Asante", date: "2024-10-24", status: "Pending" },
  { id: "DOC-003", title: "Invoice #4521", submittedBy: "Mike Jones", date: "2024-10-22", status: "Approved" },
];

const taskQueue: DashboardTask[] = [
  { documentId: "DOC-001", title: "Review Q3 Financial Report", assigneeName: "Mark Anderson", dueDate: "Tomorrow", action: "Review" },
  { documentId: "DOC-002", title: "Approve Project Alpha Plan", assigneeName: "Finance", dueDate: "In 2 days", action: "Approve" },
  { documentId: "DOC-008", title: "Review HR Benefits Update", assigneeName: "Sarah Wilson", dueDate: "Tomorrow", action: "Review" },
];

export function getDashboardStats(): DashboardStats {
  return { ...stats };
}

export function getRecentDocuments(limit = 5): RecentDocument[] {
  return recentDocuments.slice(0, limit);
}

export function getTaskQueue(limit = 5): DashboardTask[] {
  return taskQueue.slice(0, limit);
}

/** Report row for Reports page table and CSV export */
export interface ReportRow {
  id: string;
  title: string;
  submittedBy: string;
  date: string;
  status: string;
  type: string;
}

const reportRows: ReportRow[] = [
  { id: "DOC-001", title: "Q3 Financial Report", submittedBy: "John Doe", date: "2024-10-24", status: "Pending", type: "Report" },
  { id: "DOC-002", title: "Project Alpha Plan", submittedBy: "Sarah Smith", date: "2024-10-23", status: "Pending", type: "Memo" },
  { id: "DOC-003", title: "Invoice #4521", submittedBy: "Mike Jones", date: "2024-10-22", status: "Approved", type: "Invoice" },
  { id: "DOC-004", title: "Client Contract v2", submittedBy: "Emily Blunt", date: "2024-10-21", status: "Rejected", type: "Contract" },
  { id: "DOC-005", title: "Annual Leave Policy", submittedBy: "Ada Mensah", date: "2024-10-25", status: "Pending", type: "Policy" },
  { id: "DOC-006", title: "IT Security Report", submittedBy: "Kwame Asante", date: "2024-10-24", status: "Pending", type: "Report" },
];

export function getReportRows(statusFilter?: string): ReportRow[] {
  const rows = [...reportRows];
  if (statusFilter && statusFilter !== "All") {
    return rows.filter((r) => r.status === statusFilter);
  }
  return rows;
}
