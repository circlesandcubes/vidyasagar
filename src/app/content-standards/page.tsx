import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { AGE_DISCLAIMER, CURATOR_STATEMENT, SKILL_DISCLAIMER } from "@/lib/site";

export const metadata = createPageMetadata({
  title: "Content standards",
  description: "The standards Vidyasagar applies to book listings, age guidance, skill notes and review claims.",
  path: "/content-standards",
});

export default function ContentStandardsPage() {
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Content standards" title="What we promise about every listing." />
        <section className="prose">
          <h2>Who curates the catalogue</h2>
          <p>{CURATOR_STATEMENT}</p>
          <p>
            Curation decides which books are listed. It is separate from the review records shown on each book page,
            which state exactly who reviewed what.
          </p>

          <h2>Standards</h2>
          <ul>
            <li>Books are published only after editorial review.</li>
            <li>Authors, illustrators, editors and translators are credited for what they actually contributed.</li>
            <li>We do not invent reviewers, credentials, sources, prices, ratings or availability.</li>
            <li>{AGE_DISCLAIMER}</li>
            <li>{SKILL_DISCLAIMER}</li>
            <li>Links to Amazon and Flipkart are labelled, and we say that we may earn a commission from them.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
