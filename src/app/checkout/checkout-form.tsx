"use client";

import { useActionState, useState } from "react";
import { placeOrderAction } from "@/app/checkout/actions";
import { initialActionState } from "@/lib/action-state";

type Address = { id: string; label: string | null; recipient_name: string; line1: string; city: string; state: string; postal_code: string; is_default: boolean };

export function CheckoutForm({ addresses }: { addresses: Address[] }) {
  const [state, action, pending] = useActionState(placeOrderAction, initialActionState);
  // One key per page load: a double-click or retry cannot create two orders.
  const [key] = useState(() => crypto.randomUUID());
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="idempotencyKey" value={key} />
      <fieldset>
        <legend>Delivery address</legend>
        {addresses.map((a, i) => (
          <div className="field" key={a.id}>
            <label>
              <input type="radio" name="addressId" value={a.id} defaultChecked={a.is_default || (i === 0 && !addresses.some((x) => x.is_default))} required />{" "}
              {a.label ?? a.recipient_name}: {a.recipient_name}, {a.line1}, {a.city}, {a.state} {a.postal_code}
            </label>
          </div>
        ))}
      </fieldset>
      {state.message && <p className="flash flash-error" role="alert">{state.message}</p>}
      <button className="button" type="submit" disabled={pending}>{pending ? "Placing order…" : "Place order and continue to payment"}</button>
      <p className="small muted">You will pay securely with Razorpay on the next step. Your order is created now and held until payment.</p>
    </form>
  );
}
