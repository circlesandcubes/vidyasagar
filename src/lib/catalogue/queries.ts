import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOK_SELECT,
  normaliseAgeGroup,
  normaliseAuthor,
  normaliseBook,
  normaliseCollection,
  normalisePublisher,
  normaliseSkill,
  normaliseSubject,
} from "@/lib/catalogue/normalise";
import type {
  AgeGroup,
  Author,
  CatalogueBook,
  Collection,
  Publisher,
  Skill,
  Subject,
} from "@/lib/catalogue/types";

// Every query here runs with the public (anon) key, so row-level security is the
// real gatekeeper. The explicit `status = 'published'` / `is_published` filters
// below are a second, visible layer — and keep the queries correct even if run
// with a more privileged key by mistake.

// The generated database types are not used for embedded selects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CatalogueClient = SupabaseClient<any, "public", any>;

type Raw = Record<string, unknown>;

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T | null {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function fetchPublishedBooks(client: CatalogueClient): Promise<CatalogueBook[]> {
  const rows = unwrap(
    await client.from("books").select(BOOK_SELECT).eq("status", "published").order("title", { ascending: true }),
  );
  return ((rows ?? []) as unknown as Raw[]).map(normaliseBook);
}

export async function fetchPublishedBookBySlug(
  client: CatalogueClient,
  slug: string,
): Promise<CatalogueBook | null> {
  const row = unwrap(
    await client.from("books").select(BOOK_SELECT).eq("status", "published").eq("slug", slug).maybeSingle(),
  );
  return row ? normaliseBook(row as unknown as Raw) : null;
}

export async function fetchAuthors(client: CatalogueClient): Promise<Author[]> {
  const rows = unwrap(
    await client.from("authors").select("*").eq("is_published", true).order("name", { ascending: true }),
  );
  return ((rows ?? []) as Raw[]).map(normaliseAuthor);
}

export async function fetchPublishers(client: CatalogueClient): Promise<Publisher[]> {
  const rows = unwrap(
    await client.from("publishers").select("*").eq("is_published", true).order("name", { ascending: true }),
  );
  return ((rows ?? []) as Raw[]).map(normalisePublisher);
}

export async function fetchSkills(client: CatalogueClient): Promise<Skill[]> {
  const rows = unwrap(
    await client
      .from("skills")
      .select("id,parent_id,name,slug,description,age_guidance,icon,display_order")
      .eq("is_published", true),
  );
  return ((rows ?? []) as Raw[]).map(normaliseSkill);
}

export async function fetchAgeGroups(client: CatalogueClient): Promise<AgeGroup[]> {
  const rows = unwrap(
    await client
      .from("age_groups")
      .select("id,name,slug,min_months,max_months,display_order")
      .eq("is_published", true)
      .order("display_order", { ascending: true }),
  );
  return ((rows ?? []) as Raw[]).map(normaliseAgeGroup);
}

export async function fetchSubjects(client: CatalogueClient): Promise<Subject[]> {
  const rows = unwrap(
    await client.from("subjects").select("id,name,slug,description").eq("is_published", true).order("name"),
  );
  return ((rows ?? []) as Raw[]).map(normaliseSubject);
}

export async function fetchCollections(client: CatalogueClient): Promise<Collection[]> {
  const rows = unwrap(
    await client
      .from("collections")
      .select("id,title,slug,description,is_featured,display_order,collection_books(book_id,position,curator_note)")
      .eq("is_published", true)
      .order("display_order", { ascending: true }),
  );
  return ((rows ?? []) as unknown as Raw[]).map(normaliseCollection);
}
