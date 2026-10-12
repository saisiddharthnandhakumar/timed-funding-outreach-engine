"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { buttonClass, cx } from "./ui";
import { CloseIcon } from "./icons";

/**
 * Modal primitives on the native <dialog> element: showModal() gives a real focus trap, Escape to close,
 * inert background and focus restoration to the opener, without any focus-management code of our own.
 */
export function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);
  // Escape fires the native `close` event; keep React state in step.
  const props = {
    ref,
    onClose: () => onClose(),
    // A click on the ::backdrop targets the <dialog> itself (its content fills the box, so inner clicks never do).
    onMouseDown: (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
  return props;
}

export function Sheet({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const id = useId();
  const props = useModal(open, onClose);
  return (
    <dialog {...props} aria-labelledby={`${id}-t`} className="dlg-sheet fixed inset-y-0 right-0 left-auto m-0 h-dvh w-full max-w-md border-y-0 border-r-0 shadow-pop">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id={`${id}-t`} className="text-heading">{title}</h2>
            {description && <p className="mt-0.5 text-meta text-ink-2">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid size-8 place-items-center rounded-md text-ink-2 hover:bg-sunken">
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{open && children}</div>
      </div>
    </dialog>
  );
}

export function Modal({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  const id = useId();
  const props = useModal(open, onClose);
  return (
    <dialog {...props} aria-labelledby={`${id}-t`} className="dlg-modal m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg shadow-pop">
      <div className="p-6">
        <h2 id={`${id}-t`} className="text-heading">{title}</h2>
        {description && <div className="mt-2 text-body text-ink-2">{description}</div>}
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}

/** “Are you sure?” with the consequence spelled out. The destructive/irreversible choice is never the default focus. */
export function ConfirmDialog({
  open, onCancel, onConfirm, title, description, confirmLabel, pending = false, tone = "primary", children,
}: {
  open: boolean; onCancel: () => void; onConfirm: () => void; title: string; description?: ReactNode; confirmLabel: string; pending?: boolean; tone?: "primary" | "danger"; children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" autoFocus onClick={onCancel} className={buttonClass("secondary")}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={pending} className={cx(buttonClass(tone === "danger" ? "danger" : "primary"))}>
            {pending ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
