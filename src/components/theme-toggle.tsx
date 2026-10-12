"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";
import { cx } from "./ui";

const KEY = "theme";

function readDark() {
  return document.documentElement.classList.contains("dark");
}
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

/** Light/dark switch. The initial class is set by an inline script in the root layout (no flash). */
export function ThemeToggle({ className = "", label = false }: { className?: string; label?: boolean }) {
  const dark = useSyncExternalStore(subscribe, readDark, () => false);

  function toggle() {
    const next = !readDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }

  const text = dark ? "Light mode" : "Dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${text.toLowerCase()}`}
      title={`Switch to ${text.toLowerCase()}`}
      className={cx("inline-flex h-9 items-center gap-2.5 rounded-md px-2.5 text-meta text-ink-2 hover:bg-line/60 hover:text-ink", className)}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
      {label && <span className="sb-collapsed:hidden">{text}</span>}
    </button>
  );
}
