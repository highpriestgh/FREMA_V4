import { NextRequest, NextResponse } from "next/server";
import { sendIdleReminderEmail } from "@/lib/email";

/** Mock documents with last activity timestamps (replace with DB query when Prisma is in place) */
const MOCK_DOCUMENTS: { id: string; title: string; lastActivityAt: Date; assignedToEmail?: string }[] = [
  { id: "DOC-001", title: "Q3 Financial Report", lastActivityAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), assignedToEmail: undefined },
  { id: "DOC-002", title: "Project Alpha Plan", lastActivityAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), assignedToEmail: undefined },
  { id: "DOC-003", title: "Invoice #4521", lastActivityAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), assignedToEmail: undefined },
  { id: "DOC-004", title: "Client Contract v2", lastActivityAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), assignedToEmail: undefined },
];

const IDLE_DAYS = parseInt(process.env.IDLE_DAYS ?? "3", 10) || 3;
const IDLE_MS = IDLE_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_TO_EMAIL = process.env.IDLE_REMINDER_EMAIL_TO ?? "";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedAuth = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;

  if (expectedAuth && authHeader !== expectedAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!expectedAuth) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set; cron route is disabled" },
      { status: 503 }
    );
  }

  const now = Date.now();
  const idleDocs = MOCK_DOCUMENTS.filter((doc) => now - doc.lastActivityAt.getTime() >= IDLE_MS);

  if (idleDocs.length === 0) {
    return NextResponse.json({ ok: true, idleCount: 0, sent: 0 });
  }

  const toEmail = DEFAULT_TO_EMAIL.trim();
  if (!toEmail) {
    return NextResponse.json(
      { error: "IDLE_REMINDER_EMAIL_TO is not set; cannot send reminders" },
      { status: 503 }
    );
  }

  let sent = 0;
  const errors: string[] = [];

  for (const doc of idleDocs) {
    const idleDays = Math.floor((now - doc.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000));
    const result = await sendIdleReminderEmail({
      documentId: doc.id,
      documentTitle: doc.title,
      idleDays,
      to: doc.assignedToEmail ?? toEmail,
    });

    if (result.success) {
      sent++;
    } else if (result.error) {
      errors.push(`${doc.id}: ${result.error}`);
    }
  }

  return NextResponse.json({
    ok: true,
    idleCount: idleDocs.length,
    sent,
    ...(errors.length > 0 && { errors }),
  });
}
