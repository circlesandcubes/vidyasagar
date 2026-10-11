import type { Metadata } from "next";
import type { CatalogueBook } from "@/lib/catalogue/types";
import { SITE_NAME } from "@/lib/site";

export const NOT_INDEXABLE: Metadata["robots"] = { index: false, follow: false };

/** Trims to a search-snippet length on a word boundary. */
export function summarise(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function createBookMetadata(book: CatalogueBook | null): Metadata {
  if (!book) {
    return {
      title: { absolute: `Book not found | ${SITE_NAME}` },
      robots: NOT_INDEXABLE,
    };
  }

  const title = `${book.title} | ${SITE_NAME}`;
  const description = book.description ? summarise(book.description) : undefined;
  const path = `/books/${book.slug}`;
  const image = book.cover_image_url
    ? [{ url: book.cover_image_url, alt: book.cover_image_alt ?? `Cover of ${book.title}` }]
    : undefined;

  return {
    title: { absolute: title },
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      type: "book",
      url: path,
      ...(image ? { images: image } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      ...(description ? { description } : {}),
      ...(image ? { images: image.map((i) => i.url) } : {}),
    },
  };
}

interface PageMetadataInput {
  title: string;
  description: string;
  path: string;
  /** Marks thin or parameterised pages (e.g. filtered listings) as non-indexable. */
  noindex?: boolean;
}

export function createPageMetadata({ title, description, path, noindex }: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url: path, type: "website" },
    ...(noindex ? { robots: NOT_INDEXABLE } : {}),
  };
}
