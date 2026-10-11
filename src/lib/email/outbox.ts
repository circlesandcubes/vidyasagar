import { renderEmail, type EmailData } from "@/lib/email/templates";
import type { EmailProvider } from "@/lib/email/provider";

export type OutboxRow = {
  dedupe_key: string;
  to_email: string;
  template: string;
  subject: string;
  body_text: string;
  body_html: string;
  status: "queued" | "sent" | "failed" | "skipped";
  last_error?: string | null;
};

export interface OutboxStore {
  /** Returns the new row id, or null when the dedupe key already exists. */
  insert(row: OutboxRow): Promise<string | null>;
  update(id: string, patch: { status: "sent" | "failed"; last_error?: string | null; sent_at?: string; attempts: number }): Promise<void>;
}

export type EnqueueResult = "sent" | "failed" | "skipped" | "duplicate";

/**
 * Records the email, then sends it if a provider is configured.
 *  - Same dedupe key twice => the second call does nothing ("duplicate").
 *  - No provider configured => stored as "skipped"; it is never reported as sent.
 *  - Provider error => "failed" with the error kept for retry/diagnosis.
 */
export async function enqueueEmail(
  deps: { store: OutboxStore; transport: { provider: EmailProvider; from: string } | null },
  args: { dedupeKey: string; to: string; data: EmailData },
): Promise<EnqueueResult> {
  const rendered = renderEmail(args.data);
  const row: OutboxRow = {
    dedupe_key: args.dedupeKey,
    to_email: args.to,
    template: args.data.kind,
    subject: rendered.subject,
    body_text: rendered.text,
    body_html: rendered.html,
    status: deps.transport ? "queued" : "skipped",
    last_error: deps.transport ? null : "Email provider is not configured",
  };
  const id = await deps.store.insert(row);
  if (id === null) return "duplicate";
  if (!deps.transport) return "skipped";
  try {
    await deps.transport.provider.send({ to: args.to, from: deps.transport.from, subject: rendered.subject, text: rendered.text, html: rendered.html });
    await deps.store.update(id, { status: "sent", sent_at: new Date().toISOString(), attempts: 1 });
    return "sent";
  } catch (error) {
    await deps.store.update(id, { status: "failed", last_error: error instanceof Error ? error.message.slice(0, 300) : "send failed", attempts: 1 });
    return "failed";
  }
}
