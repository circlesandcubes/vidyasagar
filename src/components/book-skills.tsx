import Link from "next/link";
import { SKILL_RELATION_LABELS, groupBookSkills } from "@/lib/catalogue/skills";
import { SKILL_DISCLAIMER } from "@/lib/site";
import type { BookSkillLink } from "@/lib/catalogue/types";

export function BookSkills({ links }: { links: BookSkillLink[] }) {
  const groups = groupBookSkills(links);
  if (groups.length === 0) return null;

  return (
    <section className="panel" aria-labelledby="skills-heading">
      <h2 id="skills-heading">Skills this book offers</h2>
      {groups.map((group) => (
        <div key={group.relation} className="skill-group">
          <h3>{SKILL_RELATION_LABELS[group.relation]}</h3>
          <ul className="skill-notes">
            {group.links.map((link) => (
              <li key={link.skill.id}>
                <Link className="chip" href={`/skills/${link.skill.slug}`}>
                  {link.skill.name}
                </Link>
                <p>{link.explanation}</p>
                {link.rationale && <p className="muted">{link.rationale}</p>}
                {link.attribution_source && <p className="muted">Source: {link.attribution_source}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="panel-footnote">{SKILL_DISCLAIMER}</p>
    </section>
  );
}
