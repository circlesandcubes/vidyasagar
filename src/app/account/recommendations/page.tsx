import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { getAgeGroups, getPublishedBooks } from "@/lib/catalogue/data";
import { recommendBooks } from "@/lib/catalogue/recommendations";
import { createUserClient } from "@/lib/supabase/server";

export const metadata = { title: "Suggestions for you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
  const user = await requireUser("/account/recommendations");
  const client = await createUserClient();
  const [books, ages, mySkills, myAges, saved] = await Promise.all([
    getPublishedBooks(), getAgeGroups(),
    client?.from("user_skill_interests").select("skill_id").eq("user_id", user.id),
    client?.from("user_age_groups").select("age_group_id").eq("user_id", user.id),
    client?.from("saved_books").select("book_id").eq("user_id", user.id),
  ]);
  const skillIds = new Set((mySkills?.data ?? []).map((r) => r.skill_id as string));
  const chosenAges = new Set((myAges?.data ?? []).map((r) => r.age_group_id as string));
  const recs = recommendBooks(
    books,
    { skillIds, ageGroups: ages.filter((a) => chosenAges.has(a.id)) },
    { excludeBookIds: new Set((saved?.data ?? []).map((r) => r.book_id as string)), limit: 24 },
  );
  const hasInterests = skillIds.size > 0 || chosenAges.size > 0;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Account" title="Suggestions for you" lede="Chosen only from the skills and ages you picked. Each suggestion says why." />
        {!hasInterests ? (
          <p className="empty-state"><Link href="/account/interests">Choose some interests</Link> to see suggestions.</p>
        ) : recs.length === 0 ? (
          <p className="empty-state">Nothing in the catalogue matches yet. Try broader interests.</p>
        ) : (
          <ul className="plain-list">
            {recs.map(({ book, reasons }) => (
              <li key={book.id} className="panel">
                <h2><Link href={`/books/${book.slug}`}>{book.title}</Link></h2>
                <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
