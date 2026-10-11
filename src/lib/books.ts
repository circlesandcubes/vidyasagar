import "server-only";

import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Book = Database["public"]["Tables"]["books"]["Row"];

export const BOOK_COLUMNS =
  "id,title,slug,subtitle,description,author,cover_image_url,isbn,price_cents,currency,publication_date,status,created_at,updated_at" as const;

type BookClient = SupabaseClient<Database>;

function createBookClient(): BookClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient<Database>(url, key);
}

export async function queryPublishedBooks(client: BookClient): Promise<Book[]> {
  const { data, error } = await client
    .from("books")
    .select(BOOK_COLUMNS)
    .eq("status", "published")
    .order("title", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function queryPublishedBookBySlug(
  client: BookClient,
  slug: string,
): Promise<Book | null> {
  const { data, error } = await client
    .from("books")
    .select(BOOK_COLUMNS)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export const getPublishedBooks = cache(async (): Promise<Book[]> => {
  const client = createBookClient();
  return client ? queryPublishedBooks(client) : [];
});

export const getPublishedBookBySlug = cache(
  async (slug: string): Promise<Book | null> => {
    const client = createBookClient();
    return client ? queryPublishedBookBySlug(client, slug) : null;
  },
);
