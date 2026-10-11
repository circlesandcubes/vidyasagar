import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { getPublicSetting, getPublishedBookBySlug } from "@/lib/catalogue/data";
import { submitReviewAction } from "@/app/books/[slug]/review/actions";

export const metadata = { title: "Write a review", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const query = await searchParams;
  const book = await getPublishedBookBySlug(slug);
  if (!book) notFound();
  await requireUser(`/books/${slug}/review`);
  const enabled = await getPublicSetting("reviews_enabled");
  return (
    <main id="main-content">
      <div className="content-wrap narrow">
        <p className="back-link"><Link href={`/books/${book.slug}`}>← {book.title}</Link></p>
        <PageIntro eyebrow="Reviews" title={`Review “${book.title}”`} />
        <Flash searchParams={query} />
        {!enabled ? (
          <p className="verification-notice">Customer reviews are not open yet.</p>
        ) : (
          <form action={submitReviewAction.bind(null, book.id, book.slug)} className="form-stack">
            <div className="field"><label htmlFor="rating">Rating</label>
              <select id="rating" name="rating" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}</select></div>
            <div className="field"><label htmlFor="body">Your review</label><textarea id="body" name="body" rows={5} required minLength={10} maxLength={2000} /></div>
            <div className="field"><label htmlFor="displayName">Name to show (optional)</label><input id="displayName" name="displayName" maxLength={60} /></div>
            <p className="small muted">Reviews are checked by our team before they appear. They are readers’ opinions, not Vidyasagar’s verification of the book.</p>
            <button className="button" type="submit">Submit review</button>
          </form>
        )}
      </div>
    </main>
  );
}
