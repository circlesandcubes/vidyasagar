import { jsonLdString } from "@/lib/catalogue/seo";

export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  // jsonLdString escapes "<" so catalogue text cannot close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
