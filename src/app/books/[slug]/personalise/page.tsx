import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { PersonaliseForm } from "@/components/personalise-form";
import { getPersonalisationForBook, getPublishedBookBySlug } from "@/lib/catalogue/data";
import { SITE_NAME } from "@/lib/site";
import { previewPersonalisationAction } from "@/app/books/[slug]/personalise/actions";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ template?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: { absolute: `Personalise | ${SITE_NAME}` }, robots: { index: false, follow: false }, alternates: { canonical: `/books/${slug}` } };
}

export default async function PersonalisePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { template: wanted } = await searchParams;
  const book = await getPublishedBookBySlug(slug);
  if (!book) notFound();
  const templates = await getPersonalisationForBook(book.id);
  if (templates.length === 0) notFound();
  const template = templates.find((t) => t.slug === wanted) ?? templates[0];

  return (
    <main id="main-content">
      <div className="content-wrap">
        <p className="back-link"><Link href={`/books/${book.slug}`}>← {book.title}</Link></p>
        <PageIntro eyebrow="Personalise" title={template.name} lede={template.description ?? undefined} />
        {templates.length > 1 && (
          <p className="small">
            Options: {templates.map((t) => <span key={t.id}><Link href={`/books/${book.slug}/personalise?template=${t.slug}`}>{t.name}</Link>{" "}</span>)}
          </p>
        )}
        <PersonaliseForm key={template.slug} template={template} action={previewPersonalisationAction.bind(null, book.slug, template.slug)} />
      </div>
    </main>
  );
}
