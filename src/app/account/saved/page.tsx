import { BookGrid } from "@/components/book-card";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { getPublishedBooks } from "@/lib/catalogue/data";
import { createUserClient } from "@/lib/supabase/server";
import { unsaveBookAction } from "@/app/account/actions";

export const metadata = { title: "Saved books", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SavedBooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser("/account/saved");
  const client = await createUserClient();
  const { data } = (await client?.from("saved_books").select("book_id").eq("user_id", user.id)) ?? { data: [] };
  const savedIds = new Set((data ?? []).map((r) => r.book_id as string));
  // Intersecting with the published catalogue drops books that have since been unpublished.
  const books = (await getPublishedBooks()).filter((b) => savedIds.has(b.id));
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Account" title="Saved books" />
        <Flash searchParams={params} />
        {books.length === 0 ? <p className="empty-state">You have not saved any books yet.</p> : (
          <>
            <BookGrid books={books} empty="" />
            <ul className="plain-list">
              {books.map((b) => (
                <li key={b.id}><form action={unsaveBookAction.bind(null, b.id)}><button className="link-button" type="submit">Remove “{b.title}” from saved</button></form></li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
