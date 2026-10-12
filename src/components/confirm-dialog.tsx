"use client";

import { Dialog } from "./shell/dialog";
import { btn } from "./ui";

/**
 * Native-dialog confirmation for actions that can't be undone. Cancel comes first in the DOM, so it is
 * the default-focused control; Esc, backdrop click and Cancel all dismiss without acting.
 */
export function ConfirmDialog({
  open, onCancel, onConfirm, title, children, confirmLabel, tone = "primary", pending = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel} label={title} className="max-w-md" dismissible={!pending}>
      <div className="p-6">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-3 space-y-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={pending} className={btn.secondary}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={pending} className={tone === "danger" ? btn.danger : btn.primary}>{pending ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </Dialog>
  );
}
