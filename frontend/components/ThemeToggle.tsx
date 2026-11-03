"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_STORAGE_KEY = "aiw.theme";

/** Light/dark toggle. The initial class is set by an inline script in the
 * root layout (before paint, from localStorage or the OS preference). */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Mount sync: adopt the class the pre-paint script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    // Read the live DOM class, not state: the pre-paint script (or the OS
    // preference behind it) can change the class after this component
    // mounted, and stale state would make the first click a no-op.
    const next = !document.documentElement.classList.contains("dark");
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* storage unavailable: theme still applies for this page view */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid h-9 w-9 place-items-center rounded-full text-navy-900 transition-colors hover:bg-navy-50"
    >
      {dark ? <Sun aria-hidden="true" className="h-4.5 w-4.5" /> : <Moon aria-hidden="true" className="h-4.5 w-4.5" />}
    </button>
  );
}
