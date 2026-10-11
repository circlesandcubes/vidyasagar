import type { CatalogueBook } from "@/lib/catalogue/types";
import { PARENT_BRAND, SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";

// Structured data describes only what is visible on the page and recorded in the
// catalogue. No prices, ratings, availability or ISBNs are invented, and nothing
// here guarantees rich results.

type JsonLd = Record<string, unknown>;

/** Serialises JSON-LD safely for embedding in a <script> tag. */
export function jsonLdString(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(String.fromCharCode(0x2028), "\\u2028")
    .replaceAll(String.fromCharCode(0x2029), "\\u2029");
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/search")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organisationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    parentOrganization: { "@type": "Organization", name: PARENT_BRAND.name, url: PARENT_BRAND.url },
  };
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

const person = (c: { author: { name: string; slug: string } }): JsonLd => ({
  "@type": "Person",
  name: c.author.name,
  url: absoluteUrl(`/authors/${c.author.slug}`),
});

export function bookJsonLd(book: CatalogueBook): JsonLd {
  const primary = book.editions.find((e) => e.is_primary) ?? book.editions[0];
  const authors = book.contributors.filter((c) => c.role === "author");
  const illustrators = book.contributors.filter((c) => c.role === "illustrator");

  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    url: absoluteUrl(`/books/${book.slug}`),
    ...(book.subtitle ? { alternativeHeadline: book.subtitle } : {}),
    ...(book.description ? { description: book.description } : {}),
    ...(book.cover_image_url ? { image: book.cover_image_url } : {}),
    ...(authors.length ? { author: authors.map(person) } : {}),
    ...(illustrators.length ? { illustrator: illustrators.map(person) } : {}),
    ...(book.publication_date ? { datePublished: book.publication_date } : {}),
    ...(primary?.language ? { inLanguage: primary.language } : {}),
    ...(primary?.isbn13 ? { isbn: primary.isbn13 } : {}),
    ...(primary?.publisher ? { publisher: { "@type": "Organization", name: primary.publisher.name } } : {}),
  };
}

export function authorJsonLd(author: { name: string; slug: string; bio: string | null; website_url: string | null }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    url: absoluteUrl(`/authors/${author.slug}`),
    ...(author.bio ? { description: author.bio } : {}),
    ...(author.website_url ? { sameAs: [author.website_url] } : {}),
  };
}
