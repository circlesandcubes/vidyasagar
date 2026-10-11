import { describe, expect, it, vi } from "vitest";
import { createResendProvider, emailConfig } from "@/lib/email/provider";
import { enqueueEmail, type OutboxRow, type OutboxStore } from "@/lib/email/outbox";
import { escapeHtml, renderEmail, type EmailData } from "@/lib/email/templates";

function memoryStore() {
  const rows = new Map<string, OutboxRow & { id: string; attempts?: number; sent_at?: string }>();
  const store: OutboxStore = {
    async insert(row) {
      if ([...rows.values()].some((r) => r.dedupe_key === row.dedupe_key)) return null;
      const id = `id-${rows.size + 1}`;
      rows.set(id, { ...row, id });
      return id;
    },
    async update(id, patch) {
      Object.assign(rows.get(id)!, patch);
    },
  };
  return { store, rows };
}
const data: EmailData = { kind: "order_confirmation", orderNumber: "VS-1001", totalMinor: 34900, lines: [{ title: "Moons", quantity: 1, totalMinor: 29900 }] };

describe("templates", () => {
  it("escapes everything user-controlled in HTML", () => {
    const out = renderEmail({ kind: "order_confirmation", orderNumber: "VS-1", totalMinor: 100, lines: [{ title: "<script>alert(1)</script>", quantity: 1, totalMinor: 100, personalisation: ['"><img src=x>'] }] });
    expect(out.html).not.toContain("<script>");
    expect(out.html).not.toContain("<img");
    expect(out.html).toContain("&lt;script&gt;");
    expect(escapeHtml(`a&b<"'`)).toBe("a&amp;b&lt;&quot;&#39;");
  });
  it("formats money from integer paise", () => {
    expect(renderEmail(data).text).toContain("₹349");
    expect(renderEmail({ kind: "refund_processed", orderNumber: "VS-1", amountMinor: 14950 }).text).toContain("₹149.50");
  });
  it("only links to https tracking URLs", () => {
    expect(renderEmail({ kind: "order_shipped", orderNumber: "VS-1", trackingUrl: "javascript:alert(1)" }).html).not.toContain("javascript:");
    expect(renderEmail({ kind: "order_shipped", orderNumber: "VS-1", trackingUrl: "https://t.example/1" }).html).toContain('href="https://t.example/1"');
  });
  it("describes the bulk acknowledgement as not a quotation", () => {
    expect(renderEmail({ kind: "bulk_enquiry_received", reference: "BE-1" }).text).toContain("not a quotation");
  });
});

describe("outbox", () => {
  const sent = () => ({ name: "fake", send: vi.fn().mockResolvedValue(undefined) });
  it("sends and records success", async () => {
    const { store, rows } = memoryStore();
    const provider = sent();
    expect(await enqueueEmail({ store, transport: { provider, from: "a@b.co" } }, { dedupeKey: "k1", to: "x@y.co", data })).toBe("sent");
    expect(provider.send).toHaveBeenCalledOnce();
    expect([...rows.values()][0].status).toBe("sent");
  });
  it("never sends the same dedupe key twice", async () => {
    const { store } = memoryStore();
    const provider = sent();
    const deps = { store, transport: { provider, from: "a@b.co" } };
    await enqueueEmail(deps, { dedupeKey: "k1", to: "x@y.co", data });
    expect(await enqueueEmail(deps, { dedupeKey: "k1", to: "x@y.co", data })).toBe("duplicate");
    expect(provider.send).toHaveBeenCalledOnce();
  });
  it("records 'skipped' (never 'sent') when no provider is configured", async () => {
    const { store, rows } = memoryStore();
    expect(await enqueueEmail({ store, transport: null }, { dedupeKey: "k2", to: "x@y.co", data })).toBe("skipped");
    const row = [...rows.values()][0];
    expect(row.status).toBe("skipped");
    expect(row.last_error).toContain("not configured");
  });
  it("records provider failures without throwing", async () => {
    const { store, rows } = memoryStore();
    const provider = { name: "fake", send: vi.fn().mockRejectedValue(new Error("boom")) };
    expect(await enqueueEmail({ store, transport: { provider, from: "a@b.co" } }, { dedupeKey: "k3", to: "x@y.co", data })).toBe("failed");
    expect([...rows.values()][0]).toMatchObject({ status: "failed", last_error: "boom" });
  });
});

describe("provider", () => {
  it("is unconfigured without a sender and key", () => {
    expect(emailConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(emailConfig({ EMAIL_FROM: "a@b.co" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(emailConfig({ EMAIL_FROM: "a@b.co", RESEND_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toEqual({ provider: "resend", apiKey: "k", from: "a@b.co" });
  });
  it("posts to the Resend API and throws on rejection", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await createResendProvider("key", f as unknown as typeof fetch).send({ to: "x@y.co", from: "a@b.co", subject: "s", text: "t" });
    expect((f.mock.calls[0] as [string])[0]).toBe("https://api.resend.com/emails");
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    await expect(createResendProvider("key", bad as unknown as typeof fetch).send({ to: "x@y.co", from: "a@b.co", subject: "s", text: "t" })).rejects.toThrow("HTTP 422");
  });
});
