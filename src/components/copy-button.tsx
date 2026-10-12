"use client";

import { useState } from "react";
import { btn } from "./ui";

/** `inline` is the small chip next to an address; `button` matches the other secondary actions. */
export function CopyButton({ value, label = "Copy", variant = "inline" }: { value: string; label?: string; variant?: "inline" | "button" }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context / permissions): the text is still visible to select */
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={variant === "button" ? btn.secondary : "inline-flex min-h-6 items-center rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-sunken hover:text-ink"}
        aria-label={variant === "inline" ? `${label} ${value}` : undefined}
      >
        {copied ? "Copied" : label}
      </button>
      <span role="status" className="sr-only">{copied ? "Copied to clipboard" : ""}</span>
    </>
  );
}
