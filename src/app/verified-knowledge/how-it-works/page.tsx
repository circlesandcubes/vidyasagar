import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";

export const metadata = createPageMetadata({
  title: "How review works",
  description: "What a Vidyasagar review record contains, when it becomes public, and what the labels do not mean.",
  path: "/verified-knowledge/how-it-works",
});

export default function HowItWorksPage() {
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Verified Knowledge" title="How review works." />
        <section className="prose">
          <h2>What a record contains</h2>
          <p>
            Every review record names the reviewer or approving party, the scope of what was covered, the version of
            the book reviewed, the date, any sources used, and the limitations. If a record does not say what it
            covers, it is not published.
          </p>

          <h2>When a record becomes public</h2>
          <p>
            A record appears on a book page only after the approving party has given permission to publish it and a
            Vidyasagar administrator has approved it. Nothing is displayed automatically because of who wrote a book.
          </p>

          <h2>Credentials</h2>
          <p>
            A reviewer&apos;s credentials are shown only when they have been checked and the reviewer has agreed to
            their disclosure. Vidyasagar does not display credentials it has not verified.
          </p>

          <h2>What stays private</h2>
          <p>
            Supporting documents provided by reviewers are kept private. The public record shows the sources cited,
            not the underlying files.
          </p>

          <h2>What the labels do not mean</h2>
          <ul>
            <li>Author-approved and publisher-approved are not independent fact-checking.</li>
            <li>A review covers only its stated scope, not every statement in the book.</li>
            <li>A story is not presented as factual because it touches on a factual topic.</li>
            <li>No label guarantees a learning outcome for any child.</li>
          </ul>

          <p>
            See <Link href="/content-standards">our content standards</Link>, or{" "}
            <Link href="/verified-knowledge">the categories in full</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
