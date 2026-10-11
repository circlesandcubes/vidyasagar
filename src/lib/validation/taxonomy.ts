import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const slug = z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.").max(80);

export const skillSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug,
  parentId: z.preprocess(blank, z.string().uuid().optional()),
  description: z.preprocess(blank, z.string().trim().max(1000).optional()),
  ageGuidance: z.preprocess(blank, z.string().trim().max(300).optional()),
  displayOrder: z.preprocess(blank, z.coerce.number().int().min(0).max(10000).default(0)),
  isPublished: checkbox,
});

export const collectionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug,
  description: z.preprocess(blank, z.string().trim().max(2000).optional()),
  isPublished: checkbox,
  isFeatured: checkbox,
});

export const collectionBookSchema = z.object({
  bookId: z.string().uuid(),
  position: z.preprocess(blank, z.coerce.number().int().min(0).max(10000).default(0)),
  curatorNote: z.preprocess(blank, z.string().trim().max(500).optional()),
});
