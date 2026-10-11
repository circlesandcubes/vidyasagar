import type { ActionState } from "@/lib/action-state";

export function ActionMessages({ state }: { state: ActionState }) {
  if (state.errors?.length) {
    return (
      <div className="flash flash-error" role="alert">
        <ul>{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
      </div>
    );
  }
  if (state.ok && state.message) return <p className="flash flash-info" role="status">{state.message}</p>;
  return null;
}
