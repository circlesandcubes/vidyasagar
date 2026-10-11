import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { addCollectionBookAction, createCollectionAction, removeCollectionBookAction, setCollectionFlagsAction } from "@/app/admin/collections/actions";

export const metadata = { title: "Collections" };
export const dynamic = "force-dynamic";

type Row = { id: string; title: string; slug: string; is_published: boolean; is_featured: boolean; books: { book_id: string; position: number; book: { title: string } | { title: string }[] | null }[] };

export default async function CollectionsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin", "curator"], "/admin/collections");
  const client = await createUserClient();
  const [{ data: collections }, { data: books }] = client
    ? await Promise.all([
        client.from("collections").select("id, title, slug, is_published, is_featured, books:collection_books(book_id, position, book:books(title))").order("display_order").order("title"),
        client.from("books").select("id, title").eq("status", "published").order("title").limit(500),
      ])
    : [{ data: [] }, { data: [] }];
  const rows = (collections ?? []) as unknown as Row[];
  return (
    <>
      <PageIntro eyebrow="Admin" title="Collections" lede="Hand-picked lists of books. Only published books appear to visitors even if added here." />
      <Flash searchParams={params} />
      {rows.length === 0 && <p className="empty-state">No collections yet.</p>}
      {rows.map((c) => (
        <section className="panel" key={c.id}>
          <h2>{c.title} <span className="small muted">/{c.slug}</span></h2>
          <div className="action-row">
            <form action={setCollectionFlagsAction.bind(null, c.id, "is_published", !c.is_published)}><button className="link-button" type="submit">{c.is_published ? "Published: hide" : "Hidden: publish"}</button></form>
            <form action={setCollectionFlagsAction.bind(null, c.id, "is_featured", !c.is_featured)}><button className="link-button" type="submit">{c.is_featured ? "Featured: unfeature" : "Feature"}</button></form>
          </div>
          <ul>{[...c.books].sort((a, b) => a.position - b.position).map((b) => {
            const book = Array.isArray(b.book) ? b.book[0] : b.book;
            return <li key={b.book_id}>{b.position}. {book?.title ?? "Unavailable book"}
              <form className="inline-form" action={removeCollectionBookAction.bind(null, c.id, b.book_id)}><button className="link-button" type="submit">Remove</button></form></li>;
          })}</ul>
          <form action={addCollectionBookAction.bind(null, c.id)} className="inline-form">
            <label className="visually-hidden" htmlFor={`b-${c.id}`}>Book to add to {c.title}</label>
            <select id={`b-${c.id}`} name="bookId">{(books ?? []).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
            <label className="visually-hidden" htmlFor={`p-${c.id}`}>Position</label>
            <input id={`p-${c.id}`} name="position" inputMode="numeric" placeholder="Position" style={{ width: 90 }} />
            <button className="button" type="submit" disabled={!books?.length}>Add book</button>
          </form>
        </section>
      ))}
      <form action={createCollectionAction} className="form-stack panel">
        <h2>New collection</h2>
        <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" required maxLength={160} /></div>
        <div className="field"><label htmlFor="slug">Web address (lowercase, hyphens)</label><input id="slug" name="slug" required maxLength={80} /></div>
        <div className="field"><label htmlFor="description">Description (optional)</label><textarea id="description" name="description" rows={3} maxLength={2000} /></div>
        <label><input type="checkbox" name="isPublished" /> Publish now</label>
        <label><input type="checkbox" name="isFeatured" /> Feature on the home page</label>
        <button className="button" type="submit">Create</button>
      </form>
    </>
  );
}
