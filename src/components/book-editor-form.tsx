"use client";

import { useActionState } from "react";
import { ActionMessages } from "@/components/action-messages";
import { initialActionState, type ActionState } from "@/lib/action-state";

export type BookEditorDefaults = {
  title: string; subtitle: string; description: string; publicationDate: string;
  ageMinMonths: string; ageMaxMonths: string; coverImageUrl: string; coverImageAlt: string;
  rightsConfirmed: boolean; rightsStatement: string;
  credits: string; skills: string; links: string; personalisation: string;
};

export const EMPTY_BOOK_DEFAULTS: BookEditorDefaults = {
  title: "", subtitle: "", description: "", publicationDate: "", ageMinMonths: "", ageMaxMonths: "",
  coverImageUrl: "", coverImageAlt: "", rightsConfirmed: false, rightsStatement: "",
  credits: "", skills: "", links: "", personalisation: "",
};

export function BookEditorForm({
  action, defaults, disabled = false, submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: BookEditorDefaults;
  disabled?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="form-stack">
      <ActionMessages state={state} />
      <fieldset disabled={disabled || pending} className="form-stack">
        <legend className="visually-hidden">Book details</legend>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required maxLength={200} defaultValue={defaults.title} />
        </div>
        <div className="field">
          <label htmlFor="subtitle">Subtitle (optional)</label>
          <input id="subtitle" name="subtitle" maxLength={200} defaultValue={defaults.subtitle} />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={6} maxLength={5000} defaultValue={defaults.description} />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ageMinMonths">Youngest age (months)</label>
            <input id="ageMinMonths" name="ageMinMonths" type="number" min={0} max={216} defaultValue={defaults.ageMinMonths} />
          </div>
          <div className="field">
            <label htmlFor="ageMaxMonths">Oldest age (months)</label>
            <input id="ageMaxMonths" name="ageMaxMonths" type="number" min={0} max={216} defaultValue={defaults.ageMaxMonths} />
          </div>
          <div className="field">
            <label htmlFor="publicationDate">Publication date</label>
            <input id="publicationDate" name="publicationDate" type="date" defaultValue={defaults.publicationDate} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="coverImageUrl">Cover image address (https)</label>
          <input id="coverImageUrl" name="coverImageUrl" type="url" maxLength={500} defaultValue={defaults.coverImageUrl} />
        </div>
        <div className="field">
          <label htmlFor="coverImageAlt">Cover description (for people who cannot see it)</label>
          <input id="coverImageAlt" name="coverImageAlt" maxLength={300} defaultValue={defaults.coverImageAlt} />
        </div>

        <h2 className="form-heading">Proposals for the editors</h2>
        <p className="small muted">
          These are suggestions. Editors decide what is published and may change or decline any of them.
        </p>
        <div className="field">
          <label htmlFor="credits">Credits — one per line: Name | role (author, illustrator, editor, translator)</label>
          <textarea id="credits" name="credits" rows={3} defaultValue={defaults.credits} />
        </div>
        <div className="field">
          <label htmlFor="skills">Skills — one per line: Skill | why this book supports it</label>
          <textarea id="skills" name="skills" rows={3} defaultValue={defaults.skills} />
        </div>
        <div className="field">
          <label htmlFor="links">Retail links — one per line: amazon https://… or flipkart https://…</label>
          <textarea id="links" name="links" rows={2} defaultValue={defaults.links} />
        </div>
        <div className="field">
          <label htmlFor="personalisation">Personalisation ideas — one per line (optional)</label>
          <textarea id="personalisation" name="personalisation" rows={2} defaultValue={defaults.personalisation} />
        </div>

        <h2 className="form-heading">Rights</h2>
        <div className="field-check">
          <input id="rightsConfirmed" name="rightsConfirmed" type="checkbox" defaultChecked={defaults.rightsConfirmed} />
          <label htmlFor="rightsConfirmed">
            I confirm that I hold, or am authorised to grant, the rights needed to list this book, its cover and its text on Vidyasagar.
          </label>
        </div>
        <div className="field">
          <label htmlFor="rightsStatement">Rights details (optional)</label>
          <textarea id="rightsStatement" name="rightsStatement" rows={2} maxLength={4000} defaultValue={defaults.rightsStatement} />
        </div>
        <button className="button" type="submit">{pending ? "Saving…" : submitLabel}</button>
      </fieldset>
    </form>
  );
}
