import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const profileSchema = z.object({ displayName: z.string().trim().max(120) });

export const addressSchema = z.object({
  label: z.preprocess(blank, z.string().trim().max(40).optional()),
  recipientName: z.string().trim().min(1, "Recipient name is required.").max(120),
  phone: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") || undefined : v),
    z.string().regex(/^(\+91)?[6-9][0-9]{9}$/, "Enter a 10-digit Indian mobile number.").optional(),
  ),
  line1: z.string().trim().min(1, "Address line 1 is required.").max(200),
  line2: z.preprocess(blank, z.string().trim().max(200).optional()),
  city: z.string().trim().min(1, "City is required.").max(100),
  state: z.string().trim().min(1, "State is required.").max(100),
  postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code."),
  isDefault: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
] as const;

export const interestsSchema = z.object({
  skillIds: z.array(z.string().uuid()).max(50),
  ageGroupIds: z.array(z.string().uuid()).max(10),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(10, "Write at least 10 characters.").max(2000),
  displayName: z.preprocess(blank, z.string().trim().max(60).optional()),
});

export const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  website: z.string().max(0).optional().default(""),
});
