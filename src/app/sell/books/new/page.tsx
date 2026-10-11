import { BookEditorForm, EMPTY_BOOK_DEFAULTS } from "@/components/book-editor-form";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createBookAction } from "@/app/sell/actions";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "New book", robots: { index: false, follow: false } };

export default async function NewBookPage() {
  await requireRole(["author", "publisher"], "/sell/books/new");
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Sell" title="Add a book" lede="Start a draft. Nothing is public until editors review and publish it." />
        <BookEditorForm action={createBookAction} defaults={EMPTY_BOOK_DEFAULTS} submitLabel="Save draft" />
      </div>
    </main>
  );
}
