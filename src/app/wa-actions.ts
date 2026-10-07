"use server";

// WhatsApp de los locales: el CRM lee lo que guarda el conector (wa-conector/) y deja mensajes en la cola.

import { PHONE_LINES } from "@/lib/config";
import { normalizePhoneAR } from "@/lib/rules";
import { requireMember } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

const LINE_IDS = PHONE_LINES.map((l) => l.id) as string[];
const validLine = (line: string) => LINE_IDS.includes(line);
const validJid = (jid: string) => /^\d+@(s\.whatsapp\.net|lid)$/.test(jid);
const MAX_PHOTOS = 30;

export type WaLineState = {
  status: "desconectado" | "esperando_qr" | "conectando" | "conectado";
  qr: string | null;
  phone: string | null;
  /** El conector dio señales de vida hace menos de 2 minutos. */
  connectorAlive: boolean;
};

export type WaChat = {
  jid: string;
  name: string | null;
  phone: string | null;
  last_message: string | null;
  last_at: string | null;
  unread: number;
  /** ids de las etiquetas de WhatsApp Business que tiene el chat */
  labels: string[];
  customer: { id: string; name: string } | null;
};

export type WaLabel = { id: string; name: string; color: number | null };

export type WaMessage = {
  id: string;
  from_me: boolean;
  body: string | null;
  kind: string;
  at: string;
  sent_by: string | null;
  /** foto guardada (se ve por /api/wa-media) */
  media_path?: string | null;
  pending?: boolean;
  error?: string | null;
};

/** Estado del teléfono y su lista de chats (la pantalla la pide cada pocos segundos). */
export async function getWaLine(line: string, q?: string, label?: string): Promise<{ state: WaLineState; chats: WaChat[]; labels: WaLabel[] } | null> {
  if (!validLine(line)) return null;
  const { supabase } = await requireMember();
  const { data: l } = await supabase.from("wa_lines").select("status, qr, phone, seen_at").eq("id", line).maybeSingle();
  if (!l) return null;
  const state: WaLineState = {
    status: l.status,
    qr: l.status === "esperando_qr" ? l.qr : null,
    phone: l.phone,
    connectorAlive: !!l.seen_at && Date.now() - Date.parse(l.seen_at) < 120_000,
  };

  let query = supabase
    .from("wa_chat_list")
    .select("jid, name, phone, last_message, last_at, unread, labels")
    .eq("line", line)
    .order("last_at", { ascending: false, nullsFirst: false })
    .limit(200);
  const term = q?.trim().replace(/[%,()]/g, "");
  if (term) {
    const digits = term.replace(/\D/g, "");
    query = query.or([`name.ilike.%${term}%`, ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : [])].join(","));
  }
  if (label) query = query.contains("labels", [label]);
  const [{ data: chats }, { data: labels }, { data: ops }] = await Promise.all([
    query.returns<Omit<WaChat, "customer">[]>(),
    supabase.from("wa_labels").select("id, name, color").eq("line", line).eq("deleted", false).order("name").returns<WaLabel[]>(),
    supabase.from("wa_label_ops").select("jid, label_id, op").eq("line", line).is("done_at", null).is("error", null).order("created_at"),
  ]);
  // Las etiquetas que pusieron o sacaron recién se ven al toque, antes de que el conector las aplique.
  const pending = new Map<string, { label_id: string; op: string }[]>();
  for (const o of ops ?? []) pending.set(o.jid, [...(pending.get(o.jid) ?? []), o]);
  const withPending = (c: Omit<WaChat, "customer">) => {
    const set = new Set(c.labels ?? []);
    for (const o of pending.get(c.jid) ?? []) o.op === "poner" ? set.add(o.label_id) : set.delete(o.label_id);
    return [...set];
  };

  // Unir cada chat con su cliente del CRM (mismo celular).
  const phones = [...new Set((chats ?? []).map((c) => c.phone).filter((p): p is string => !!p))];
  const customerOf = new Map<string, { id: string; name: string }>();
  if (phones.length) {
    const { data: cs } = await supabase.from("customers").select("id, name, phone").in("phone", phones).is("archived_at", null);
    for (const c of cs ?? []) if (c.phone) customerOf.set(c.phone, { id: c.id, name: c.name });
  }
  // Un chat por celular (ver sameChatJids): queda el más reciente, con los no leídos y etiquetas de los dos.
  const merged: Omit<WaChat, "customer">[] = [];
  const byPhone = new Map<string, Omit<WaChat, "customer">>();
  for (const c of chats ?? []) {
    const first = c.phone ? byPhone.get(c.phone) : undefined;
    if (!first) {
      const copy = { ...c, labels: withPending(c) };
      merged.push(copy);
      if (c.phone) byPhone.set(c.phone, copy);
      continue;
    }
    first.unread += c.unread;
    first.labels = [...new Set([...first.labels, ...withPending(c)])];
    first.name ??= c.name;
  }
  return {
    state,
    labels: labels ?? [],
    chats: merged.map((c) => ({ ...c, customer: c.phone ? (customerOf.get(c.phone) ?? null) : null })),
  };
}

/**
 * WhatsApp a veces guarda a la misma persona con dos identificadores (el número y un "@lid"):
 * todos los chats del mismo celular en ese teléfono se muestran como una sola conversación.
 */
async function sameChatJids(supabase: Awaited<ReturnType<typeof requireMember>>["supabase"], line: string, jid: string): Promise<string[]> {
  const { data: chat } = await supabase.from("wa_chats").select("phone").eq("line", line).eq("jid", jid).maybeSingle();
  if (!chat?.phone) return [jid];
  const { data } = await supabase.from("wa_chats").select("jid").eq("line", line).eq("phone", chat.phone);
  return [...new Set([jid, ...(data ?? []).map((c) => c.jid as string)])];
}

/** Pedirle al celu los mensajes anteriores de un chat (el conector lo hace en unos segundos). */
export async function requestWaHistory(line: string, jid: string): Promise<ActionResult> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  if (!validJid(jid)) return { ok: false, error: "Chat inválido." };
  const { supabase, me } = await requireMember();
  // Si ya se pidió hace menos de 2 minutos, no repetir.
  const { count } = await supabase
    .from("wa_history_requests")
    .select("id", { count: "exact", head: true })
    .eq("line", line)
    .eq("jid", jid)
    .gt("created_at", new Date(Date.now() - 120_000).toISOString());
  if (count) return { ok: true };
  const { error } = await supabase.from("wa_history_requests").insert({ line, jid, created_by: me.email });
  if (error) return { ok: false, error: "No se pudo pedir." };
  return { ok: true };
}

/** Mensajes de un chat (los últimos 200) y lo marca como leído. Incluye los que todavía están en la cola. */
export async function getWaMessages(line: string, jid: string): Promise<WaMessage[]> {
  if (!validLine(line) || !jid) return [];
  const { supabase } = await requireMember();
  const jids = await sameChatJids(supabase, line, jid);
  const [{ data: msgs }, { data: queued }] = await Promise.all([
    supabase
      .from("wa_messages")
      .select("id, from_me, body, kind, at, sent_by, media_path")
      .eq("line", line)
      .in("jid", jids)
      .order("at", { ascending: false })
      .limit(500),
    supabase
      .from("wa_outbox")
      .select("id, body, created_at, created_by, error, media_path")
      .eq("line", line)
      .in("jid", jids)
      .is("sent_at", null)
      .order("created_at"),
  ]);
  await supabase.from("wa_chats").update({ read_at: new Date().toISOString() }).eq("line", line).in("jid", jids);
  return [
    ...(msgs ?? []).reverse(),
    ...(queued ?? []).map((o) => ({
      id: `cola-${o.id}`,
      from_me: true,
      body: o.body,
      kind: o.media_path ? "foto" : "texto",
      at: o.created_at,
      sent_by: o.created_by,
      media_path: o.media_path,
      pending: true,
      error: o.error,
    })),
  ];
}

/** Mandar un mensaje: queda en la cola y el conector lo envía en unos segundos. */
export async function sendWaMessage(line: string, jid: string, body: string): Promise<ActionResult> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Escribí algo." };
  if (!validJid(jid)) return { ok: false, error: "Chat inválido." };
  const { supabase, me } = await requireMember();
  const { error } = await supabase.from("wa_outbox").insert({ line, jid, body: text.slice(0, 4000), created_by: me.email });
  if (error) return { ok: false, error: "No se pudo mandar. Probá de nuevo." };
  return { ok: true };
}

/**
 * Mandar fotos (hasta 30): el navegador ya las subió al almacenamiento (out/<teléfono>/<uuid>.jpg);
 * acá quedan en la cola, en orden, con el texto en la primera.
 */
export async function queueWaPhotos(line: string, jid: string, caption: string, paths: string[]): Promise<ActionResult> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  if (!validJid(jid)) return { ok: false, error: "Chat inválido." };
  if (!paths.length || paths.length > MAX_PHOTOS) return { ok: false, error: `Entre 1 y ${MAX_PHOTOS} fotos.` };
  const valid = new RegExp(`^out/${line}/[0-9a-f-]{36}\\.jpg$`);
  if (!paths.every((p) => valid.test(p))) return { ok: false, error: "Foto inválida." };
  const { supabase, me } = await requireMember();
  const now = Date.now();
  const rows = paths.map((media_path, i) => ({
    line,
    jid,
    body: i === 0 ? caption.trim().slice(0, 1000) : "",
    media_path,
    media_type: "image/jpeg",
    created_by: me.email,
    // Un milisegundo de diferencia para que el conector las mande en este orden.
    created_at: new Date(now + i).toISOString(),
  }));
  const { error } = await supabase.from("wa_outbox").insert(rows);
  if (error) return { ok: false, error: "No se pudieron mandar. Probá de nuevo." };
  return { ok: true };
}

/** Poner o sacar una etiqueta de WhatsApp Business a un chat (el conector la aplica en el teléfono). */
export async function setWaChatLabel(line: string, jid: string, labelId: string, on: boolean): Promise<ActionResult> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  if (!validJid(jid)) return { ok: false, error: "Chat inválido." };
  if (!/^[\w-]{1,40}$/.test(labelId)) return { ok: false, error: "Etiqueta inválida." };
  const { supabase, me } = await requireMember();
  const { error } = await supabase.from("wa_label_ops").insert({
    line,
    jid,
    label_id: labelId,
    op: on ? "poner" : "sacar",
    created_by: me.email,
  });
  if (error) return { ok: false, error: "No se pudo. Probá de nuevo." };
  return { ok: true };
}

/** Escribirle a un número que todavía no tiene chat (ej. desde la ficha del cliente). Devuelve el chat. */
export async function startWaChat(line: string, phone: string, body: string): Promise<ActionResult<{ jid: string }>> {
  const digits = phone.replace(/\D/g, "");
  if (!/^549\d{10}$/.test(digits)) return { ok: false, error: "Celular inválido." };
  const jid = `${digits}@s.whatsapp.net`;
  const r = await sendWaMessage(line, jid, body);
  return r.ok ? { ok: true, data: { jid } } : r;
}

/**
 * Abrir un chat por número (para escribirle a alguien nuevo): si ya hay chat con ese celular, ese;
 * si no, uno vacío que se crea con el primer mensaje.
 */
export async function openWaChatByPhone(line: string, raw: string): Promise<ActionResult<WaChat>> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  const phone = normalizePhoneAR(raw);
  if (!phone) return { ok: false, error: "Número inválido. Escribilo con característica, ej: 11 2345-6789 o 223 456-7890." };
  const { supabase } = await requireMember();
  const [{ data: existing }, { data: customer }] = await Promise.all([
    supabase
      .from("wa_chat_list")
      .select("jid, name, phone, last_message, last_at, unread, labels")
      .eq("line", line)
      .eq("phone", phone)
      .order("last_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<Omit<WaChat, "customer">>(),
    supabase.from("customers").select("id, name").eq("phone", phone).is("archived_at", null).limit(1).maybeSingle<{ id: string; name: string }>(),
  ]);
  const chat: WaChat = existing
    ? { ...existing, labels: existing.labels ?? [], customer: customer ?? null }
    : { jid: `${phone}@s.whatsapp.net`, name: null, phone, last_message: null, last_at: null, unread: 0, labels: [], customer: customer ?? null };
  return { ok: true, data: chat };
}

/** Desvincular el teléfono (pide un QR nuevo). Solo admin. */
export async function unlinkWaLine(line: string): Promise<ActionResult> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  const { supabase, me } = await requireMember();
  if (!me.is_admin) return { ok: false, error: "Solo el admin puede desvincular." };
  const { error } = await supabase.from("wa_lines").update({ command: "desvincular" }).eq("id", line);
  if (error) return { ok: false, error: "No se pudo." };
  return { ok: true };
}

// ── Stickers ──────────────────────────────────────────────────

/** Los stickers que ya pasaron por este teléfono (los últimos 60 distintos), para reenviarlos. */
export async function getWaStickers(line: string): Promise<string[]> {
  if (!validLine(line)) return [];
  const { supabase } = await requireMember();
  const { data } = await supabase
    .from("wa_messages")
    .select("media_path")
    .eq("line", line)
    .eq("kind", "sticker")
    .not("media_path", "is", null)
    .order("at", { ascending: false })
    .limit(300);
  return [...new Set((data ?? []).map((m) => m.media_path as string))].slice(0, 60);
}

export async function queueWaSticker(line: string, jid: string, path: string): Promise<ActionResult> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  if (!validJid(jid)) return { ok: false, error: "Chat inválido." };
  if (!new RegExp(`^in/${line}/[\\w-]+\\.webp$`).test(path)) return { ok: false, error: "Sticker inválido." };
  const { supabase, me } = await requireMember();
  const { error } = await supabase
    .from("wa_outbox")
    .insert({ line, jid, body: "", media_path: path, media_type: "image/webp", media_kind: "sticker", created_by: me.email });
  if (error) return { ok: false, error: "No se pudo mandar. Probá de nuevo." };
  return { ok: true };
}

// ── Respuestas rápidas ("/atajo") ─────────────────────────────

export type WaQuickReply = { id: string; shortcut: string; body: string };

export async function getWaQuickReplies(): Promise<WaQuickReply[]> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("wa_quick_replies").select("id, shortcut, body").order("shortcut").returns<WaQuickReply[]>();
  return data ?? [];
}

export async function saveWaQuickReply(input: { id?: string; shortcut: string; body: string }): Promise<ActionResult> {
  const shortcut = input.shortcut.trim().replace(/^\//, "").toLowerCase().replace(/\s+/g, "-");
  const body = input.body.trim();
  if (!/^[a-z0-9áéíóúñü_-]{1,30}$/.test(shortcut)) return { ok: false, error: "El atajo va sin espacios ni símbolos (ej: precios, envio, local)." };
  if (!body) return { ok: false, error: "Escribí el mensaje." };
  const { supabase, me } = await requireMember();
  const row = { shortcut, body: body.slice(0, 4000), created_by: me.email, updated_at: new Date().toISOString() };
  const { error } = input.id ? await supabase.from("wa_quick_replies").update(row).eq("id", input.id) : await supabase.from("wa_quick_replies").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? `Ya existe /${shortcut}.` : "No se pudo guardar." };
  return { ok: true };
}

export async function deleteWaQuickReply(id: string): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { error } = await supabase.from("wa_quick_replies").delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo borrar." };
  return { ok: true };
}
