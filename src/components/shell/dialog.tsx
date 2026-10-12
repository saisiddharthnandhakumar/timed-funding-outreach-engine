"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Native modal <dialog>: showModal() gives a focus trap, inert background and Esc. Adds backdrop-click
 * dismissal and body scroll lock. The caller restores focus in `onClose`.
 */
export function Dialog({ open, onClose, label, children, className = "", dismissible = true }: { open: boolean; onClose: () => void; label: string; children: ReactNode; className?: string; dismissible?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      document.body.style.overflow = "hidden";
    }
    if (!open && el.open) el.close();
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClose={() => {
        document.body.style.overflow = "";
        onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) ref.current.close();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40 ${className}`}
    >
      {open && children}
    </dialog>
  );
}
