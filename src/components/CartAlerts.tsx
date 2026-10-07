"use client";

// Aviso en pantalla cuando entra un carrito abandonado nuevo en Tiendanube (revisa cada minuto mientras el CRM está a la vista).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NewCart } from "@/app/api/carritos-nuevos/route";
import { formatMoney } from "@/lib/rules";

const POLL_MS = 60_000;
const SEEN_KEY = "crm_carritos_vistos";
const MAX_SHOWN = 3;

function readSeen(): number[] | null {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null");
  } catch {
    return null;
  }
}
function writeSeen(ids: number[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-500)));
  } catch {
    // sin almacenamiento: avisa de nuevo al recargar, no pasa nada
  }
}

/** Un "ding" cortito, sin archivos de sonido (si el navegador no deja, no suena y listo). */
function ding() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close(), 800);
  } catch {
    // sin sonido
  }
}

export function CartAlerts() {
  const [alerts, setAlerts] = useState<NewCart[]>([]);
  const seenMem = useRef<number[] | null>(null);

  const check = useCallback(async () => {
    const carts: NewCart[] | null = await fetch("/api/carritos-nuevos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!carts) return;
    const seen = readSeen() ?? seenMem.current;
    const ids = carts.map((c) => c.id);
    const next = [...new Set([...(seen ?? []), ...ids])];
    seenMem.current = next;
    writeSeen(next);
    // La primera vez solo se anotan: se avisa de los que entren de acá en adelante.
    if (!seen) return;
    const fresh = carts.filter((c) => !seen.includes(c.id));
    if (!fresh.length) return;
    setAlerts((prev) => [...fresh, ...prev].slice(0, MAX_SHOWN));
    ding();
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(() => document.visibilityState === "visible" && check(), POLL_MS);
    return () => clearInterval(t);
  }, [check]);

  if (!alerts.length) return null;
  const close = (id: number) => setAlerts((a) => a.filter((x) => x.id !== id));
  return (
    <div className="fixed bottom-24 right-4 z-[90] flex w-[min(92vw,22rem)] flex-col gap-2 md:bottom-6" aria-live="polite">
      {alerts.map((c) => (
        <div key={c.id} role="alert" aria-label="Nuevo carrito abandonado" className="card relative space-y-2 border-amber-300 p-4 shadow-2xl">
          <button onClick={() => close(c.id)} className="absolute right-3 top-2 text-stone-500 hover:text-stone-900" aria-label="Cerrar aviso">
            ✕
          </button>
          <p className="pr-6 text-sm font-bold">🛒 Nuevo carrito abandonado</p>
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate font-semibold">{c.name ?? c.email ?? "Sin nombre"}</p>
            <p className="shrink-0 font-bold">{formatMoney(c.total)}</p>
          </div>
          {c.summary && <p className="line-clamp-2 text-sm text-stone-600">{c.summary}</p>}
          <div className="flex gap-2">
            {c.phone && (
              <Link
                href={`/telefonos/carritos?${new URLSearchParams({ numero: c.phone, texto: c.message })}`}
                onClick={() => close(c.id)}
                className="btn-primary flex-1 py-1.5 text-sm"
              >
                💬 Escribirle
              </Link>
            )}
            <Link
              href={`/carritos?${new URLSearchParams({ q: c.phone?.slice(-8) ?? c.email ?? c.name ?? "" })}`}
              onClick={() => close(c.id)}
              className="btn-secondary flex-1 py-1.5 text-sm"
            >
              Ver
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
