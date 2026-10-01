"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`rounded-lg px-2 py-1 text-base hover:bg-stone-100 ${className}`}
      title={dark ? "Pasar a modo claro" : "Pasar a modo oscuro"}
      aria-label={dark ? "Pasar a modo claro" : "Pasar a modo oscuro"}
    >
      {dark === null ? "🌓" : dark ? "☀️" : "🌙"}
    </button>
  );
}
