export function TextField({
  name, label, type = "text", autoComplete, required = true, hint, defaultValue, minLength, maxLength,
}: {
  name: string; label: string; type?: string; autoComplete?: string; required?: boolean; hint?: string;
  defaultValue?: string; minLength?: number; maxLength?: number;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name} name={name} type={type} autoComplete={autoComplete} required={required}
        aria-describedby={hintId} defaultValue={defaultValue} minLength={minLength} maxLength={maxLength}
      />
      {hint && <p id={hintId} className="small muted">{hint}</p>}
    </div>
  );
}
