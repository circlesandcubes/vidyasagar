import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { VERIFICATION_TYPES } from "@/lib/catalogue/verification";
import type { VerificationLevel } from "@/lib/catalogue/verification";

export const metadata = createPageMetadata({
  title: "Verified Knowledge",
  description:
    "How Vidyasagar shows who has approved or reviewed a children's book, and why author or publisher approval is never presented as independent verification.",
  path: "/verified-knowledge",
});

const GROUPS: Array<{ level: VerificationLevel; heading: string; intro: string }> = [
  {
    level: "independent",
    heading: "Independent review",
    intro: "Someone other than the author or publisher examined the content, within a recorded scope.",
  },
  {
    level: "approval",
    heading: "Approval by the people who made the book",
    intro:
      "The author or publisher stands behind the content. This is accountability, but it is not independent verification, and Vidyasagar never describes it that way.",
  },
  {
    level: "classification",
    heading: "Classification",
    intro: "A description of what kind of book this is.",
  },
];

export default function VerifiedKnowledgePage() {
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro
          eyebrow="Vidyasagar Verified Knowledge Framework"
          title="Who has reviewed this book, and what did they review?"
          lede="Different kinds of approval carry different kinds of accountability. Each book page shows exactly which ones apply, and says so plainly when none do."
        />
        <section className="prose" aria-label="Review categories">
          {GROUPS.map((group) => (
            <div key={group.level} className="framework-group">
              <h2>{group.heading}</h2>
              <p>{group.intro}</p>
              <ul className="framework-list">
                {Object.values(VERIFICATION_TYPES)
                  .filter((info) => info.level === group.level)
                  .map((info) => (
                    <li key={info.type}>
                      <h3>{info.label}</h3>
                      <p>{info.summary}</p>
                      <p className="muted">{info.limitation}</p>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <p>
            <Link href="/verified-knowledge/how-it-works">How review records are made and published</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
