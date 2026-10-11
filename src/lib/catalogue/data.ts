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
