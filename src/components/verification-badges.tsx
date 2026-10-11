import { VERIFICATION_TYPES } from "@/lib/catalogue/verification";
import type { VerificationType } from "@/lib/catalogue/types";

const LEVEL_NOTE = {
  independent: "independent review",
  approval: "approval by the author or publisher, not independent verification",
  classification: "classification, not verification",
} as const;

/**
 * Compact labels for listings. Meaning never relies on colour alone: each badge
 * carries a text note for assistive technology and a different outline style.
 */
export function VerificationBadges({ types }: { types: VerificationType[] }) {
  if (types.length === 0) return null;
  return (
    <ul className="badge-list" aria-label="Review information">
      {types.map((type) => {
        const info = VERIFICATION_TYPES[type];
        return (
          <li key={type} className={`badge badge-${info.level}`}>
            {info.label}
            <span className="visually-hidden"> ({LEVEL_NOTE[info.level]})</span>
          </li>
        );
      })}
    </ul>
  );
}
