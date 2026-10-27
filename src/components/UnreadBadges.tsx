"use client";

// Chats sin leer por teléfono: se piden cuando llega un mensaje (aviso en vivo) o cada 2 min, y se comparten entre las pestañas y el menú.
import { useEffect, useState } from "react";
import { onLive } from "@/lib/live";

let cache: Record<string, number> | null = null;
let last = 0;
const listeners = new Set<(c: Record<string, number>) => void>();

async function refresh() {
  if (Date.now() - last < 3_000) return;
  last = Date.now();
  const r = await fetch("/api/wa/no-leidos", { cache: "no-store" })
    .then((x) => (x.ok && x.headers.get("content-type")?.includes("json") ? x.json() : null))
    .catch(() => null);
  if (!r) return;
  cache = r;
  listeners.forEach((l) => l(r));
}

export function useUnread() {
  const [counts, setCounts] = useState(cache);
  useEffect(() => {
    listeners.add(setCounts);
    refresh();
    const stop = onLive(["wa_messages", "wa_chats"], refresh, 120_000, 20_000);
    return () => {
      listeners.delete(setCounts);
      stop();
    };
  }, []);
  return counts;
}

/** Circulito verde con la cantidad (no se muestra si es 0). */
export function UnreadBadge({ line, total = false }: { line?: string; total?: boolean }) {
  const counts = useUnread();
  if (!counts) return null;
  const n = total ? Object.values(counts).reduce((s, x) => s + x, 0) : (counts[line ?? ""] ?? 0);
  if (!n) return null;
  return (
    <span
      className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-[#fff]"
      aria-label={`${n} ${n === 1 ? "chat sin leer" : "chats sin leer"}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
