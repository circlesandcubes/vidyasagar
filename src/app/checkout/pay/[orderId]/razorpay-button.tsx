"use client";

import { useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: () => void): void };
  }
}

type Props = { orderNumber: string; keyId: string; providerOrderId: string; amountMinor: number; email: string; businessName: string };

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.onload = () => resolve(true);
    el.onerror = () => resolve(false);
    document.body.appendChild(el);
  });
}

export function RazorpayButton(props: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setMessage(null);
    setBusy(true);
    if (!(await loadScript()) || !window.Razorpay) {
      setBusy(false);
      return setMessage("The payment window could not be loaded. Check your connection and try again.");
    }
    const rz = new window.Razorpay({
      key: props.keyId,
      order_id: props.providerOrderId,
      amount: props.amountMinor,
      currency: "INR",
      name: props.businessName,
      description: `Order ${props.orderNumber}`,
      prefill: { email: props.email },
      handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        const res = await fetch("/api/payments/razorpay/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderNumber: props.orderNumber, ...response }),
        });
        // The webhook is the backstop: even if this call fails, a captured payment is applied there.
        window.location.href = res.ok ? `/orders/${props.orderNumber}?notice=paid` : `/orders/${props.orderNumber}?notice=payment_pending`;
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rz.on("payment.failed", () => { setBusy(false); setMessage("The payment did not go through. You have not been charged for a failed attempt. You can try again."); });
    rz.open();
  }

  return (
    <div>
      <button className="button" type="button" onClick={pay} disabled={busy}>{busy ? "Waiting for payment…" : "Pay now"}</button>
      {message && <p className="flash flash-error" role="alert">{message}</p>}
    </div>
  );
}
