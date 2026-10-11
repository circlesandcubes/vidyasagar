export const SITE_NAME = "Vidyasagar";
export const SITE_TAGLINE = "Every Book. A World of Discovery.";
export const SITE_DESCRIPTION =
  "A curated bookstore for children's books. Find stories that inspire, books that build skills, and discoveries that grow with your child.";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const PARENT_BRAND = {
  name: "Circles & Cubes",
  url: process.env.NEXT_PUBLIC_PARENT_BRAND_URL ?? "https://circlesandcubes.com",
} as const;

export const AFFILIATE_DISCLOSURE =
  "Vidyasagar may earn a commission from qualifying purchases made through Amazon or Flipkart links, at no extra cost to you.";

export const AGE_DISCLAIMER =
  "Age ranges are indicative. Children develop at different paces, so use them as a starting point rather than an assessment.";

export const SKILL_DISCLAIMER =
  "Skill notes describe what a book offers. They are discovery aids, not diagnoses or guaranteed learning outcomes.";

/** Statement about who curates the catalogue, shown on the content standards page. */
export const CURATOR_STATEMENT =
  "Vidyasagar's catalogue is curated by a parent of a four-year-old, with an academic background and experience of both academic and corporate careers.";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
