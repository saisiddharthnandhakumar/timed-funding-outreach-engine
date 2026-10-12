"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";
import { buttonClass } from "./ui";

/** Copies text to the clipboard. `iconOnly` is for inline use next to an address. */
export function CopyButton({ value, label = "Copy", iconOnly = false, variant = "ghost", size = "sm", className = "" }: { value: string; label?: string; iconOnly?: boolean; variant?: "ghost" | "secondary"; size?: "sm" | "md"; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context / permissions): the text is still visible to select */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={iconOnly ? (copied ? "Copied" : `${label}: ${value.length > 40 ? `${value.slice(0, 40)}…` : value}`) : undefined}
      className={iconOnly ? `grid size-7 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink ${className}` : buttonClass(variant, size, className)}
    >
      {copied ? <CheckIcon className="text-ok" /> : <CopyIcon />}
      {!iconOnly && <span aria-live="polite">{copied ? "Copied" : label}</span>}
    </button>
  );
}
