import { Resend } from "resend";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM_EMAIL = process.env.IDLE_REMINDER_FROM_EMAIL ?? "DMS <onboarding@resend.dev>";

export interface IdleReminderPayload {
  documentId: string;
  documentTitle: string;
  idleDays: number;
  to: string;
}

/**
 * Sends an idle document reminder email via Resend.
 * Used by the cron job to notify about documents with no activity for N days.
 */
export async function sendIdleReminderEmail({
  documentId,
  documentTitle,
  idleDays,
  to,
}: IdleReminderPayload): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY is not set" };
  }

  const resend = getResend();
  if (!resend) return { success: false, error: "RESEND_API_KEY is not set" };

  const subject = `Document idle for ${idleDays} days: ${documentTitle}`;
  const body = `
Document "${documentTitle}" (${documentId}) has had no activity for ${idleDays} days.

Please review or escalate in the Document Management System.
  `.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      text: body,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
