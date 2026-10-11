import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const ORGANISATION_TYPES = ["school", "library", "ngo", "corporate", "bookseller", "individual", "other"] as const;
export const ORGANISATION_LABELS: Record<(typeof ORGANISATION_TYPES)[number], string> = {
  school: "School", library: "Library", ngo: "NGO or non-profit", corporate: "Company", bookseller: "Bookseller", individual: "Individual", other: "Other",
};

export const enquirySchema = z.object({
  organisation: z.string().trim().min(2, "Enter the organisation name.").max(160),
  organisationType: z.enum(ORGANISATION_TYPES),
  contactName: z.string().trim().min(2, "Enter a contact name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") || undefined : v),
    z.string().regex(/^(\+91)?[6-9][0-9]{9}$/, "Enter a 10-digit Indian mobile number.").optional(),
  ),
  city: z.preprocess(blank, z.string().trim().max(100).optional()),
  state: z.preprocess(blank, z.string().trim().max(100).optional()),
  quantity: z.preprocess(blank, z.coerce.number().int().min(1).max(1_000_000).optional()),
  neededBy: z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date.").optional()),
  message: z.string().trim().min(10, "Tell us a little about what you need (10+ characters).").max(4000),
  bookId: z.preprocess(blank, z.string().uuid().optional()),
  bookQuantity: z.preprocess(blank, z.coerce.number().int().min(1).max(1_000_000).optional()),
  // Honeypot: real visitors never fill this in.
  website: z.preprocess(blank, z.string().max(200).optional()),
});

export const noteSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const tierSchema = z.object({
  label: z.string().trim().min(1).max(80),
  minQuantity: z.coerce.number().int().min(2).max(1_000_000),
  percent: z.coerce.number().gt(0).max(100),
  isPublic: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});
