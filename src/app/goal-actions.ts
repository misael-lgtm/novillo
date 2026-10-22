"use server";

// Ventas off de Tiendanube del mes, para festejar en pantalla cuando entra una nueva.

import { attributeStoreSales, getStoreSales, monthStart } from "@/lib/goals";
import { getTeam, requireMember } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

export type OffSale = { id: number; total: number; seller: string | null; avatar: string | null };

/** Las ventas off que cuentan este mes (id, monto y vendedor). null si la tienda no está conectada o falló. */
export async function getOffSalesFeed(): Promise<{ month: string; sales: OffSale[] } | null> {
  const { supabase } = await requireMember();
  const month = monthStart();
  const store = await getStoreSales(supabase, month);
  if (!store?.ok) return null;
  const team = await getTeam();
  const { sellerOf } = await attributeStoreSales(supabase, team, store.off);
  return {
    month,
    sales: store.off.map((x) => {
      const m = team.find((t) => t.email === sellerOf.get(x.id));
      return { id: x.id, total: x.total, seller: m ? m.name.split(" ")[0] : x.offName, avatar: m?.avatar ?? null };
    }),
  };
}

// ── Imagen del festejo (ej. un sticker), la carga el admin en Equipo ──

const IMAGE_KEY = "festejo_imagen";
const MAX_IMAGE_CHARS = 700_000; // ~500 KB de PNG

export async function getCelebrationImage(): Promise<string | null> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("app_settings").select("value").eq("key", IMAGE_KEY).maybeSingle();
  return data?.value ?? null;
}

/** Guardar (o sacar, con null) la imagen del festejo. Solo admin. */
export async function saveCelebrationImage(dataUrl: string | null): Promise<ActionResult> {
  const { supabase, me } = await requireMember();
  if (!me.is_admin) return { ok: false, error: "Solo el admin puede cambiarla." };
  if (dataUrl !== null && (!dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > MAX_IMAGE_CHARS))
    return { ok: false, error: "La imagen es muy pesada o no es válida." };
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: IMAGE_KEY, value: dataUrl, updated_by: me.email, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: "No se pudo guardar." };
  return { ok: true };
}

// ── Audios: el del festejo de ventas off (ej. "Ankara Messi") y el del aviso de carrito nuevo. Los carga el admin en Equipo ──

export type AlertSound = "venta" | "carrito";
const AUDIO_KEYS: Record<AlertSound, string> = { venta: "festejo_audio", carrito: "carrito_audio" };
const MAX_AUDIO_CHARS = 900_000; // ~650 KB de audio (unos 30-40 segundos de MP3)

export async function getCelebrationAudio(which: AlertSound = "venta"): Promise<string | null> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("app_settings").select("value").eq("key", AUDIO_KEYS[which]).maybeSingle();
  return data?.value ?? null;
}

/** Guardar (o sacar, con null) un audio. Solo admin. */
export async function saveCelebrationAudio(dataUrl: string | null, which: AlertSound = "venta"): Promise<ActionResult> {
  const { supabase, me } = await requireMember();
  if (!me.is_admin) return { ok: false, error: "Solo el admin puede cambiarlo." };
  if (!(which in AUDIO_KEYS)) return { ok: false, error: "Audio inválido." };
  if (dataUrl !== null && (!/^data:audio\/[a-z0-9.+-]+;base64,/i.test(dataUrl) || dataUrl.length > MAX_AUDIO_CHARS))
    return { ok: false, error: "El audio es muy pesado (máx. ~650 KB) o no es válido." };
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: AUDIO_KEYS[which], value: dataUrl, updated_by: me.email, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: "No se pudo guardar." };
  return { ok: true };
}
