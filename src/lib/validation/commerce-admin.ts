import { z } from "zod";
import { parseRupeesToMinor } from "@/lib/money";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const uuid = z.string().uuid();

const rupees = (message: string) =>
  z.string().trim().transform((v, ctx) => {
    const minor = parseRupeesToMinor(v);
    if (minor === null) { ctx.addIssue({ code: "custom", message }); return z.NEVER; }
    return minor;
  });
const optionalRupees = (message: string) => z.preprocess(blank, rupees(message).optional());
const optionalDate = z.preprocess(blank, z.coerce.date().optional());

export const commerceSettingsSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  supportEmail: z.string().trim().email().max(254),
  shippingFlat: rupees("Enter the flat delivery charge in rupees (0 is allowed)."),
  shippingFreeOver: optionalRupees("Enter the free-delivery threshold in rupees, or leave blank."),
  policyReturns: z.string().trim().max(20000).default(""),
  policyShipping: z.string().trim().max(20000).default(""),
  policyPrivacy: z.string().trim().max(20000).default(""),
  policyTerms: z.string().trim().max(20000).default(""),
});

export const priceSchema = z
  .object({
    editionId: uuid,
    list: rupees("Enter the list price in rupees."),
    sale: optionalRupees("Enter the sale price in rupees, or leave blank."),
    taxRatePercent: z.preprocess(blank, z.coerce.number().min(0).max(100).default(0)),
    stock: z.preprocess(blank, z.coerce.number().int().min(0).max(1_000_000).optional()),
    isActive: checkbox,
  })
  .refine((v) => v.list > 0, { message: "The list price must be more than zero.", path: ["list"] })
  .refine((v) => v.sale === undefined || (v.sale > 0 && v.sale < v.list), { message: "A sale price must be above zero and below the list price.", path: ["sale"] });

export const discountRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["percent", "fixed"]),
    value: z.string().trim(),
    minSubtotal: optionalRupees("Enter the minimum subtotal in rupees."),
    startsAt: optionalDate,
    endsAt: optionalDate,
    stackable: checkbox,
    requiresCoupon: checkbox,
    isActive: checkbox,
  })
  .transform((v, ctx) => {
    let value: number | null = null;
    if (v.kind === "percent") {
      const pct = Number(v.value);
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) value = Math.round(pct * 100);
    } else {
      const minor = parseRupeesToMinor(v.value);
      if (minor !== null && minor > 0) value = minor;
    }
    if (value === null) { ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a percentage between 0 and 100, or an amount in rupees." }); return z.NEVER; }
    if (v.startsAt && v.endsAt && v.startsAt >= v.endsAt) { ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start." }); return z.NEVER; }
    return { ...v, value };
  });

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, "3-32 letters, numbers, hyphens or underscores."),
  ruleId: uuid,
  maxRedemptions: z.preprocess(blank, z.coerce.number().int().min(1).max(1_000_000).optional()),
  perUserLimit: z.preprocess(blank, z.coerce.number().int().min(1).max(100).default(1)),
  expiresAt: optionalDate,
});

export const shipmentSchema = z.object({
  carrier: z.string().trim().min(1).max(80),
  tracking: z.preprocess(blank, z.string().trim().max(80).optional()),
  trackingUrl: z.preprocess(blank, z.string().trim().url().max(500).refine((u) => u.startsWith("https://"), "Use an https link.").optional()),
  note: z.preprocess(blank, z.string().trim().max(500).optional()),
});

export const refundSchema = z.object({
  amount: rupees("Enter the refund amount in rupees."),
  reason: z.string().trim().min(3).max(500),
});

export const ORDER_NEXT: Record<string, string[]> = {
  pending_payment: ["cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  needs_review: ["cancelled"],
};
