import "server-only";

import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  fetchAgeGroups,
  fetchAuthors,
  fetchCollections,
  fetchPublishedBookBySlug,
  fetchPublishedBooks,
  fetchPublishers,
  fetchSkills,
  fetchSubjects,
} from "@/lib/catalogue/queries";
import type { CatalogueClient } from "@/lib/catalogue/queries";
import { buildSkillTree } from "@/lib/catalogue/skills";
import type { PersonalisationTemplate } from "@/lib/personalisation";

/**
 * Public, read-only client using the anon key. Returns null when Supabase is not
 * configured so pages render their empty states instead of failing the build.
 * Privileged keys are never used here.
 */
function createPublicClient(): CatalogueClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const getPublishedBooks = cache(async () => {
  const client = createPublicClient();
  return client ? fetchPublishedBooks(client) : [];
});

export const getPublishedBookBySlug = cache(async (slug: string) => {
  const client = createPublicClient();
  return client ? fetchPublishedBookBySlug(client, slug) : null;
});

export const getAuthors = cache(async () => {
  const client = createPublicClient();
  return client ? fetchAuthors(client) : [];
});

export const getPublishers = cache(async () => {
  const client = createPublicClient();
  return client ? fetchPublishers(client) : [];
});

export const getSkills = cache(async () => {
  const client = createPublicClient();
  return client ? fetchSkills(client) : [];
});

export const getSkillTree = cache(async () => buildSkillTree(await getSkills()));

export const getAgeGroups = cache(async () => {
  const client = createPublicClient();
  return client ? fetchAgeGroups(client) : [];
});

export const getSubjects = cache(async () => {
  const client = createPublicClient();
  return client ? fetchSubjects(client) : [];
});

export const getCollections = cache(async () => {
  const client = createPublicClient();
  return client ? fetchCollections(client) : [];
});

export type PublicCorrection = { id: string; summary: string; corrected_on: string };

/** Published corrections for a published book (RLS limits rows; this just selects them). */
export const getCorrectionsForBook = cache(async (bookId: string): Promise<PublicCorrection[]> => {
  const client = createPublicClient();
  if (!client) return [];
  const { data } = await client
    .from("content_corrections")
    .select("id, summary, corrected_on")
    .eq("book_id", bookId)
    .order("corrected_on", { ascending: false });
  return (data ?? []) as PublicCorrection[];
});

type TemplateRow = {
  id: string; slug: string; name: string; description: string | null; preview_note: string | null;
  price_adjustment_minor: number; lead_time_days: number | null;
  fields: {
    key: string; label: string; help_text: string | null; field_type: "text" | "textarea" | "choice";
    is_required: boolean; min_length: number; max_length: number; choices: unknown; display_order: number;
  }[];
};

/** Active personalisation templates enabled for a published book (RLS-limited). */
export const getPersonalisationForBook = cache(async (bookId: string): Promise<PersonalisationTemplate[]> => {
  const client = createPublicClient();
  if (!client) return [];
  const { data } = await client
    .from("book_personalisation")
    .select(
      "template:personalisation_templates(id, slug, name, description, preview_note, price_adjustment_minor, lead_time_days, fields:personalisation_fields(key, label, help_text, field_type, is_required, min_length, max_length, choices, display_order))",
    )
    .eq("book_id", bookId)
    .eq("is_enabled", true);
  const out: PersonalisationTemplate[] = [];
  for (const row of data ?? []) {
    const t = (Array.isArray(row.template) ? row.template[0] : row.template) as TemplateRow | null;
    if (!t) continue;
    out.push({
      ...t,
      fields: [...t.fields]
        .sort((a, b) => a.display_order - b.display_order)
        .map((f) => ({ ...f, choices: Array.isArray(f.choices) ? (f.choices as unknown[]).map(String) : null })),
    });
  }
  return out;
});

export type PublicReview = { id: string; rating: number; body: string; display_name: string | null; created_at: string };

/** Empty unless the reviews feature is enabled: the RLS policy checks the setting. */
export const getPublishedReviews = cache(async (bookId: string): Promise<PublicReview[]> => {
  const client = createPublicClient();
  if (!client) return [];
  const { data } = await client
    .from("book_reviews")
    .select("id, rating, body, display_name, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as PublicReview[];
});

export const getPublicSetting = cache(async (key: string): Promise<boolean> => {
  const client = createPublicClient();
  if (!client) return false;
  const { data } = await client.from("site_settings").select("value").eq("key", key).maybeSingle();
  return data?.value === true;
});
