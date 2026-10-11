"use client";

import { useActionState } from "react";
import { ActionMessages } from "@/components/action-messages";
import { initialActionState, type ActionState } from "@/lib/action-state";

export function EditionForm({ action }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="form-stack">
      <ActionMessages state={state} />
      <div className="field-row">
        <div className="field">
          <label htmlFor="format">Format</label>
          <select id="format" name="format" defaultValue="paperback">
            <option value="paperback">Paperback</option>
            <option value="hardcover">Hardcover</option>
            <option value="board_book">Board book</option>
            <option value="ebook">E-book</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="language">Language code</label>
          <input id="language" name="language" defaultValue="en" maxLength={12} />
        </div>
        <div className="field">
          <label htmlFor="isbn13">ISBN-13 (optional)</label>
          <input id="isbn13" name="isbn13" inputMode="numeric" maxLength={17} />
        </div>
        <div className="field">
          <label htmlFor="pageCount">Pages (optional)</label>
          <input id="pageCount" name="pageCount" type="number" min={1} max={5000} />
        </div>
      </div>
      <button className="button" type="submit" disabled={pending}>Add edition</button>
    </form>
  );
}
