import { BookCard } from "@/components/book-card";
import { SKILL_RELATION_LABELS } from "@/lib/catalogue/skills";
import type { SkillBookEntry } from "@/lib/catalogue/entities";

/** Each book is shown with the curator's note on how it supports the skill. */
export function SkillBookList({ entries, empty }: { entries: SkillBookEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="empty-state">{empty}</p>;
  return (
    <ul className="skill-book-list">
      {entries.map(({ book, link }) => (
        <li key={book.id}>
          <BookCard book={book} />
          <div className="skill-book-note">
            <p className="skill-book-relation">{SKILL_RELATION_LABELS[link.relation]}</p>
            <p>{link.explanation}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
