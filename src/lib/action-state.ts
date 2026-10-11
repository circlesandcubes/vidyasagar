import { MESSAGES } from "@/lib/messages";

export type ActionState = { ok: boolean; message?: string; errors?: string[] };
export const initialActionState: ActionState = { ok: false };

/** Maps database trigger/constraint messages to a code in MESSAGES. */
export function dbErrorCode(message: string | undefined): keyof typeof MESSAGES {
  if (!message) return "failed";
  const known: [RegExp, keyof typeof MESSAGES][] = [
    [/Rights must be confirmed/i, "rights_required"],
    [/description is required/i, "description_required"],
    [/author credit is required/i, "author_credit_required"],
    [/At least one edition/i, "edition_required"],
    [/note is required/i, "note_required"],
    [/cannot be edited/i, "locked"],
    [/not allowed/i, "not_allowed"],
    [/duplicate key|unique/i, "duplicate"],
    [/row-level security|permission denied|only (editorial )?staff|only an administrator/i, "permission_denied"],
  ];
  for (const [pattern, code] of known) if (pattern.test(message)) return code;
  return "failed";
}

export function friendlyDbError(message: string | undefined): string {
  return MESSAGES[dbErrorCode(message)].text;
}
