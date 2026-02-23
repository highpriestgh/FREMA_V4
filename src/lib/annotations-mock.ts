/**
 * Annotations mock for Phase 3. In-memory annotations and shared-viewing placeholder.
 */

export interface Annotation {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  pageRef?: number;
  x?: number;
  y?: number;
}

export interface SharedSessionParticipant {
  userId: string;
  userName: string;
  joinedAt: string;
}

export interface SharedSession {
  documentId: string;
  isActive: boolean;
  participants: SharedSessionParticipant[];
}

const annotationsByDoc: Map<string, Annotation[]> = new Map();
const sharedSessions: Map<string, SharedSession> = new Map();

const seedAnnotations: Annotation[] = [
  {
    id: "ann-1",
    documentId: "DOC-001",
    authorId: "u1",
    authorName: "Mark Anderson",
    text: "Please verify figures on page 2.",
    createdAt: "2024-10-24T10:30:00Z",
    pageRef: 2,
  },
  {
    id: "ann-2",
    documentId: "DOC-001",
    authorId: "u2",
    authorName: "Sarah Wilson",
    text: "Verified. All figures match source.",
    createdAt: "2024-10-24T11:00:00Z",
    pageRef: 2,
  },
];

seedAnnotations.forEach((a) => {
  const list = annotationsByDoc.get(a.documentId) ?? [];
  list.push(a);
  annotationsByDoc.set(a.documentId, list);
});

export function getAnnotations(documentId: string): Annotation[] {
  return [...(annotationsByDoc.get(documentId) ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function addAnnotation(
  documentId: string,
  payload: Omit<Annotation, "id" | "documentId" | "createdAt">
): Annotation {
  const list = annotationsByDoc.get(documentId) ?? [];
  const id = `ann-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const annotation: Annotation = {
    id,
    documentId,
    createdAt,
    ...payload,
  };
  list.push(annotation);
  annotationsByDoc.set(documentId, list);
  return annotation;
}

export function getSharedSession(documentId: string): SharedSession {
  const existing = sharedSessions.get(documentId);
  if (existing) return { ...existing };
  return {
    documentId,
    isActive: false,
    participants: [],
  };
}

/** Placeholder: join or start a shared viewing session (no-op in mock). */
export function joinSharedSession(
  documentId: string,
  userId: string,
  userName: string
): SharedSession {
  let session = sharedSessions.get(documentId);
  if (!session) {
    session = { documentId, isActive: true, participants: [] };
    sharedSessions.set(documentId, session);
  }
  if (!session.participants.some((p) => p.userId === userId)) {
    session.participants.push({
      userId,
      userName,
      joinedAt: new Date().toISOString(),
    });
  }
  session.isActive = true;
  return { ...session };
}

/** Placeholder: leave shared session (no-op in mock). */
export function leaveSharedSession(documentId: string, userId: string): SharedSession {
  const session = sharedSessions.get(documentId);
  if (!session) return getSharedSession(documentId);
  session.participants = session.participants.filter((p) => p.userId !== userId);
  session.isActive = session.participants.length > 0;
  return { ...session };
}
