"use client";

import { useRef, useState } from "react";
import { ChoiceInput } from "./choice-input";
import { btn } from "./ui";

/** A long list shown as "A · B · C +8 more". Click Edit to change it. */
export function CollapsedChoice(props: React.ComponentProps<typeof ChoiceInput> & { preview?: number }) {
  const { preview = 3, ...rest } = props;
  const [editing, setEditing] = useState(false);
  const editBtn = useRef<HTMLButtonElement>(null);
  if (editing) {
    return (
      <div>
        <ChoiceInput {...rest} autoFocusTrigger />
        <button type="button" onClick={() => { setEditing(false); requestAnimationFrame(() => editBtn.current?.focus()); }} className={`${btn.ghost} mt-2 -ml-3`}>Done editing</button>
      </div>
    );
  }
  const shown = rest.value.slice(0, preview);
  const more = rest.value.length - shown.length;
  return (
    <div>
      <div className="text-sm font-medium text-ink">{rest.label}</div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.95rem] text-muted">
          {shown.length ? shown.join(" · ") : rest.placeholder ?? "None selected"}
          {more > 0 && <span className="text-faint"> +{more} more</span>}
        </p>
        <button ref={editBtn} type="button" onClick={() => setEditing(true)} className={btn.ghost}>Edit<span className="sr-only"> {rest.label}</span></button>
      </div>
    </div>
  );
}
