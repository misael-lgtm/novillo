"use client";

// Avisos en vivo de la base (Supabase Realtime): cuando cambia algo en esas tablas se avisa a quien esté escuchando.
// Una sola conexión para todo el CRM. Reemplaza el "preguntar cada 3 segundos", que gastaba el servidor (Vercel).

import { createClient } from "@/lib/supabase/client";

type Topic = "wa_messages" | "wa_chats" | "wa_chat_labels" | "live_ping";
const listeners = new Map<Topic, Set<() => void>>();
let started = false;

function start() {
  if (started) return;
  started = true;
  const ch = createClient().channel("crm-live");
  for (const table of ["wa_messages", "wa_chats", "wa_chat_labels", "live_ping"] as Topic[]) {
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table } as never, () => listeners.get(table)?.forEach((f) => f()));
  }
  ch.subscribe();
}

/**
 * Llama a fn cuando cambia alguna de esas tablas (agrupando cambios seguidos) y, por las dudas, cada fallbackMs
 * mientras la pestaña está a la vista. Al volver a la pestaña también refresca.
 */
export function onLive(tables: Topic[], fn: () => void, fallbackMs: number): () => void {
  start();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (document.visibilityState === "visible") fn();
    }, 400);
  };
  for (const t of tables) {
    if (!listeners.has(t)) listeners.set(t, new Set());
    listeners.get(t)!.add(fire);
  }
  const iv = setInterval(() => document.visibilityState === "visible" && fn(), fallbackMs);
  const onVis = () => document.visibilityState === "visible" && fn();
  document.addEventListener("visibilitychange", onVis);
  return () => {
    for (const t of tables) listeners.get(t)?.delete(fire);
    clearInterval(iv);
    document.removeEventListener("visibilitychange", onVis);
    if (timer) clearTimeout(timer);
  };
}
