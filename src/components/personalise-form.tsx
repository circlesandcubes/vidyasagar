"use client";

import { useActionState } from "react";
import type { PreviewState } from "@/app/books/[slug]/personalise/actions";
import { formatMinor } from "@/lib/money";
import type { PersonalisationTemplate } from "@/lib/personalisation";

export function PersonaliseForm({
  template,
  action,
}: {
  template: PersonalisationTemplate;
  action: (prev: PreviewState, formData: FormData) => Promise<PreviewState>;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as PreviewState);
  const errors = state.status === "invalid" ? state.errors : {};
  const input = state.status === "invalid" ? state.input : {};
  return (
    <>
      <form action={formAction} className="form-stack">
        {template.fields.map((f) => {
          const error = errors[f.key];
          const hintId = `${f.key}-hint`;
          const common = { id: f.key, name: f.key, "aria-describedby": hintId, "aria-invalid": Boolean(error) } as const;
          return (
            <div className="field" key={f.key}>
              <label htmlFor={f.key}>{f.label}{f.is_required ? "" : " (optional)"}</label>
              {f.field_type === "choice" ? (
                <select {...common} defaultValue={input[f.key] ?? ""}>
                  <option value="">Choose…</option>
                  {(f.choices ?? []).map((c) => <option key={c}>{c}</option>)}
                </select>
              ) : f.field_type === "textarea" ? (
                <textarea {...common} rows={4} maxLength={f.max_length} defaultValue={input[f.key] ?? ""} />
              ) : (
                <input {...common} maxLength={f.max_length} defaultValue={input[f.key] ?? ""} />
              )}
              <p id={hintId} className="small muted">{f.help_text ? `${f.help_text} ` : ""}Up to {f.max_length} characters.</p>
              {error && <p className="flash flash-error" role="alert">{error}</p>}
            </div>
          );
        })}
        <button className="button" type="submit" disabled={pending}>{pending ? "Checking…" : "Preview"}</button>
      </form>

      {state.status === "ok" && (
        <section className="panel" aria-labelledby="preview-h" aria-live="polite">
          <h2 id="preview-h">Your preview</h2>
          <dl className="review-facts">
            {template.fields.filter((f) => state.values[f.key]).map((f) => (
              <div key={f.key}><dt>{f.label}</dt><dd style={{ whiteSpace: "pre-line" }}>{state.values[f.key]}</dd></div>
            ))}
          </dl>
          <p className="panel-footnote">
            {template.preview_note ?? "This is a text preview of what will be printed, not the final layout."}
            {template.price_adjustment_minor > 0 && ` Personalisation adds ${formatMinor(template.price_adjustment_minor)}.`}
            {template.lead_time_days ? ` Allow about ${template.lead_time_days} extra day(s).` : ""}
          </p>
          <p className="small muted">Personalised books are made to order. Please check spelling carefully.</p>
        </section>
      )}
    </>
  );
}
