"use client";

import { useState } from "react";

export function CopyLinkButton({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2500);
  }

  return (
    <>
      <button type="button" className="link-button" onClick={copy}>
        Copy link
      </button>
      <span role="status" className="visually-hidden">
        {state === "copied" ? "Link copied" : state === "failed" ? "Could not copy the link" : ""}
      </span>
      {state === "copied" && <span aria-hidden="true"> ✓</span>}
    </>
  );
}
