import type { BookSkillLink, Skill, SkillRelation } from "@/lib/catalogue/types";

export interface SkillNode extends Skill {
  children: SkillNode[];
}

export function buildSkillTree(skills: Skill[]): SkillNode[] {
  const byId = new Map<string, SkillNode>(skills.map((s) => [s.id, { ...s, children: [] }]));
  const roots: SkillNode[] = [];

  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    // A skill whose parent is unpublished (and so absent) is shown at the top level
    // rather than silently disappearing.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (nodes: SkillNode[]) => {
    nodes.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function findSkillNode(tree: SkillNode[], slug: string): SkillNode | null {
  for (const node of tree) {
    if (node.slug === slug) return node;
    const found = findSkillNode(node.children, slug);
    if (found) return found;
  }
  return null;
}

/** The skill's own id plus every descendant id. */
export function skillIdsWithDescendants(node: SkillNode): Set<string> {
  const ids = new Set<string>([node.id]);
  node.children.forEach((child) => skillIdsWithDescendants(child).forEach((id) => ids.add(id)));
  return ids;
}

export const SKILL_RELATION_ORDER: SkillRelation[] = ["practised", "supported", "incidental"];

export const SKILL_RELATION_LABELS: Record<SkillRelation, string> = {
  practised: "Practised through activities in the book",
  supported: "Supported by the story or subject",
  incidental: "Incidental",
};

/** Approved skill links only, grouped by how directly the book supports the skill. */
export function groupBookSkills(links: BookSkillLink[]): Array<{ relation: SkillRelation; links: BookSkillLink[] }> {
  const approved = links.filter((l) => l.is_approved);
  return SKILL_RELATION_ORDER.map((relation) => ({
    relation,
    links: approved
      .filter((l) => l.relation === relation)
      .sort((a, b) => a.skill.name.localeCompare(b.skill.name)),
  })).filter((group) => group.links.length > 0);
}
