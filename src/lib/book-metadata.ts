import type { Metadata } from "next";
import type { Book } from "@/lib/books";
import { SITE_NAME } from "@/lib/site";

export function createBookMetadata(book: Book | null): Metadata {
  if (!book) {
    return {
      title: { absolute: `Book not found | ${SITE_NAME}` },
      robots: { index: false, follow: false },
    };
  }

  return {
    title: { absolute: `${book.title} | ${SITE_NAME}` },
    ...(book.description ? { description: book.description } : {}),
    openGraph: {
      title: `${book.title} | ${SITE_NAME}`,
      ...(book.description ? { description: book.description } : {}),
      type: "website",
    },
  };
}
