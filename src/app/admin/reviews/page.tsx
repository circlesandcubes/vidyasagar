import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createUserClient } from "@/lib/supabase/server";
import { moderateReviewAction } from "@/app/admin/reviews/actions";

export const metadata = { title: "Review moderation" };

export default async function ReviewModerationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const client = await createUserClient();
  const { data } = (await client?.from("book_reviews").select("id, rating, body, display_name, status, created_at, book:books(title)").order("created_at", { ascending: false }).limit(100)) ?? { data: [] };
  return (
    <>
      <PageIntro eyebrow="Admin" title="Customer reviews" />
      <Flash searchParams={params} />
      {!data?.length && <p className="empty-state">No reviews.</p>}
      {data?.map((r) => {
        const book = (Array.isArray(r.book) ? r.book[0] : r.book) as { title: string } | null;
        return (
          <section className="panel" key={r.id}>
            <h2>{book?.title} — {r.rating}/5 <span className="muted">({r.status})</span></h2>
            <p className="small">{r.display_name ?? "A reader"} · {new Date(r.created_at).toLocaleString("en-IN")}</p>
            <p>{r.body}</p>
            <form action={moderateReviewAction.bind(null, r.id, "published")} className="inline-form"><button className="button" type="submit">Publish</button></form>
            <form action={moderateReviewAction.bind(null, r.id, "rejected")} className="inline-form"><button className="link-button" type="submit">Reject</button></form>
          </section>
        );
      })}
    </>
  );
}
