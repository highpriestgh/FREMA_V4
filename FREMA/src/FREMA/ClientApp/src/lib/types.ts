/**
 * Wire contracts, mirroring the server's DTOs.
 *
 * Hand-written for now. Once the OpenAPI document settles these should be generated from it
 * (NSwag or Kiota), so a server-side rename becomes a compile error here instead of an
 * `undefined` at runtime.
 */

// Numeric because the server serialises enums as their underlying int. Keeping the same
// names and values means the two sides cannot drift silently.
export const DocumentStatus = {
  Draft: 0,
  Pending: 1,
  Returned: 2,
  Approved: 3,
  Rejected: 4,
  Archived: 5,
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const RoutingStatus = {
  Pending: 0,
  Approved: 1,
  Rejected: 2,
  Reviewed: 3,
  Withdrawn: 4,
} as const;

export type RoutingStatus = (typeof RoutingStatus)[keyof typeof RoutingStatus];

export const Priority = {
  Low: 0,
  Normal: 1,
  High: 2,
  Urgent: 3,
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

export const WorkflowDecision = {
  Approve: 0,
  Reject: 1,
  Review: 2,
} as const;

export type WorkflowDecision = (typeof WorkflowDecision)[keyof typeof WorkflowDecision];

export const documentStatusLabel: Record<DocumentStatus, string> = {
  [DocumentStatus.Draft]: "Draft",
  [DocumentStatus.Pending]: "Pending",
  [DocumentStatus.Returned]: "Returned",
  [DocumentStatus.Approved]: "Approved",
  [DocumentStatus.Rejected]: "Rejected",
  [DocumentStatus.Archived]: "Archived",
};

export const priorityLabel: Record<Priority, string> = {
  [Priority.Low]: "Low",
  [Priority.Normal]: "Normal",
  [Priority.High]: "High",
  [Priority.Urgent]: "Urgent",
};

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface Profile {
  id: string;
  userName: string;
  email: string;
  fullName: string;
  departmentId: string | null;
  department: string | null;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  icon: string | null;
  children: MenuItem[];
}

export interface ReferenceItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  usageCount: number;
}

export interface UserLookup {
  id: string;
  fullName: string;
  email: string;
  departmentId: string | null;
  department: string | null;
}

export interface DocumentSummary {
  id: string;
  number: string;
  title: string;
  status: DocumentStatus;
  documentType: string | null;
  origin: string | null;
  uploadedBy: string;
  uploadedById: string;
  currentStep: string | null;
  hasFile: boolean;
  fileSizeBytes: number | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface FileMetadata {
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  pageCount: number | null;
}

/** Tells the client whether approving will need a recipient, before the user commits. */
export interface NextStep {
  name: string;
  requiresRecipientChoice: boolean;
  departmentId: string | null;
}

export interface Routing {
  id: string;
  stepName: string;
  stepOrder: number;
  department: string;
  assignedToId: string;
  assignedTo: string;
  routedBy: string | null;
  priority: Priority;
  status: RoutingStatus;
  note: string | null;
  decision: string | null;
  routedAt: string;
  dueDate: string | null;
  actedAt: string | null;
  isReturn: boolean;
}

export interface Comment {
  id: string;
  authorId: string;
  author: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
}

export interface DocumentDetail {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  status: DocumentStatus;
  documentTypeId: string | null;
  documentType: string | null;
  originId: string | null;
  origin: string | null;
  folderId: string | null;
  uploadedById: string;
  uploadedBy: string;
  workflowName: string | null;
  currentStepId: string | null;
  currentStep: string | null;
  nextStep: NextStep | null;
  file: FileMetadata | null;
  createdAt: string;
  updatedAt: string | null;
  closedAt: string | null;
  routings: Routing[];
  comments: Comment[];
}

export interface InboxItem {
  routingId: string;
  documentId: string;
  number: string;
  title: string;
  documentType: string | null;
  stepName: string;
  priority: Priority;
  note: string | null;
  routedBy: string | null;
  routedAt: string;
  dueDate: string | null;
  isOverdue: boolean;
  isReturn: boolean;
}

export interface Dashboard {
  myWork: {
    awaitingMe: number;
    overdueForMe: number;
    urgentForMe: number;
    returnedToMe: number;
    myDraft: number;
    myInProgress: number;
  };
  byStatus: { status: DocumentStatus; label: string; count: number }[];
  byDepartment: { department: string; pending: number; overdue: number }[];
  recentActivity: {
    action: string;
    user: string | null;
    documentId: string | null;
    documentTitle: string | null;
    at: string;
  }[];
}

/** Permission names, mirroring the server's `Permissions` class. */
export const Permission = {
  ViewDocuments: "documents.view",
  ViewAllDocuments: "documents.view.all",
  UploadDocuments: "documents.upload",
  EditDocuments: "documents.edit",
  DeleteDocuments: "documents.delete",
  ApproveDocuments: "documents.approve",
  RouteDocuments: "documents.route",
  CommentOnDocuments: "documents.comment",
  ManageFolders: "folders.manage",
  ViewReports: "reports.view",
  ViewAudit: "audit.view",
  ManageUsers: "admin.users",
  ManageRoles: "admin.roles",
  ManageOrigins: "admin.origins",
  ManageDocumentTypes: "admin.types",
  ManageDepartments: "admin.departments",
  ManageSettings: "admin.settings",
} as const;
