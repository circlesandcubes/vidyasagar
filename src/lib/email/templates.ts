import { formatMinor } from "@/lib/money";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type EmailData =
  | { kind: "order_confirmation"; orderNumber: string; totalMinor: number; lines: { title: string; quantity: number; totalMinor: number; personalisation?: string[] }[] }
  | { kind: "order_shipped"; orderNumber: string; carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null }
  | { kind: "refund_processed"; orderNumber: string; amountMinor: number }
  | { kind: "newsletter_confirm"; confirmUrl: string; unsubscribeUrl: string }
  | { kind: "bulk_enquiry_received"; reference: string }
  | { kind: "quotation_ready"; reference: string; totalMinor: number; validUntil: string | null };

export type RenderedEmail = { subject: string; text: string; html: string };

const FOOTER_TEXT = `\n\n— ${SITE_NAME}\n${SITE_URL}`;

function wrapHtml(title: string, paragraphsHtml: string): string {
  return `<!doctype html><html lang="en"><body style="font-family:Georgia,serif;color:#1b2b2f;line-height:1.5;max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:22px">${escapeHtml(title)}</h1>${paragraphsHtml}<p style="color:#56666a;font-size:13px">— ${escapeHtml(SITE_NAME)}</p></body></html>`;
}

export function renderEmail(data: EmailData): RenderedEmail {
  switch (data.kind) {
    case "order_confirmation": {
      const lines = data.lines
        .map((l) => `${l.title} × ${l.quantity} — ${formatMinor(l.totalMinor)}${l.personalisation?.length ? ` (${l.personalisation.join("; ")})` : ""}`);
      const subject = `Your ${SITE_NAME} order ${data.orderNumber}`;
      return {
        subject,
        text: `Thank you for your order ${data.orderNumber}.\n\n${lines.join("\n")}\n\nTotal: ${formatMinor(data.totalMinor)}\n\nYou can follow your order at ${SITE_URL}/orders/${encodeURIComponent(data.orderNumber)}.${FOOTER_TEXT}`,
        html: wrapHtml(
          `Thank you for your order ${data.orderNumber}`,
          `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul><p><strong>Total: ${escapeHtml(formatMinor(data.totalMinor))}</strong></p><p><a href="${escapeHtml(`${SITE_URL}/orders/${encodeURIComponent(data.orderNumber)}`)}">View your order</a></p>`,
        ),
      };
    }
    case "order_shipped": {
      const bits = [data.carrier && `Carrier: ${data.carrier}`, data.trackingNumber && `Tracking number: ${data.trackingNumber}`].filter(Boolean) as string[];
      const url = data.trackingUrl && /^https:\/\//.test(data.trackingUrl) ? data.trackingUrl : null;
      return {
        subject: `Order ${data.orderNumber} has shipped`,
        text: `Your order ${data.orderNumber} is on its way.\n${bits.join("\n")}${url ? `\nTrack it: ${url}` : ""}${FOOTER_TEXT}`,
        html: wrapHtml(`Order ${data.orderNumber} has shipped`, `<p>${bits.map(escapeHtml).join("<br>")}</p>${url ? `<p><a href="${escapeHtml(url)}">Track your parcel</a></p>` : ""}`),
      };
    }
    case "refund_processed":
      return {
        subject: `Refund for order ${data.orderNumber}`,
        text: `A refund of ${formatMinor(data.amountMinor)} for order ${data.orderNumber} has been processed. It can take a few working days to appear with your bank.${FOOTER_TEXT}`,
        html: wrapHtml(`Refund for order ${data.orderNumber}`, `<p>A refund of ${escapeHtml(formatMinor(data.amountMinor))} has been processed. It can take a few working days to appear with your bank.</p>`),
      };
    case "newsletter_confirm":
      return {
        subject: `Confirm your ${SITE_NAME} subscription`,
        text: `Please confirm that you want to receive email from ${SITE_NAME}: ${data.confirmUrl}\n\nIf you did not ask for this, ignore this message and you will not be subscribed. To remove yourself later: ${data.unsubscribeUrl}${FOOTER_TEXT}`,
        html: wrapHtml("Confirm your subscription", `<p><a href="${escapeHtml(data.confirmUrl)}">Yes, subscribe me</a></p><p>If you did not ask for this, ignore this message and you will not be subscribed.</p><p><a href="${escapeHtml(data.unsubscribeUrl)}">Unsubscribe</a></p>`),
      };
    case "bulk_enquiry_received":
      return {
        subject: `We received your enquiry ${data.reference}`,
        text: `Thank you. We have your bulk enquiry (reference ${data.reference}) and will reply by email. This message is an acknowledgement, not a quotation.${FOOTER_TEXT}`,
        html: wrapHtml("We received your enquiry", `<p>Reference <strong>${escapeHtml(data.reference)}</strong>. We will reply by email. This message is an acknowledgement, not a quotation.</p>`),
      };
    case "quotation_ready":
      return {
        subject: `Quotation ${data.reference}`,
        text: `Your quotation ${data.reference} is ready: total ${formatMinor(data.totalMinor)}${data.validUntil ? `, valid until ${data.validUntil}` : ""}.${FOOTER_TEXT}`,
        html: wrapHtml(`Quotation ${data.reference}`, `<p>Total ${escapeHtml(formatMinor(data.totalMinor))}${data.validUntil ? `, valid until ${escapeHtml(data.validUntil)}` : ""}.</p>`),
      };
  }
}
