"use server";

// WhatsApp de los locales: el CRM lee lo que guarda el conector (wa-conector/) y deja mensajes en la cola.

import { PHONE_LINES } from "@/lib/config";
import { requireMember } from "@/lib/session";
import type { ActionResult } from "@/lib/types";
import { randomUUID } from "node:crypto";

const LINE_IDS = PHONE_LINES.map((l) => l.id) as string[];
const validLine = (line: string) => LINE_IDS.includes(line);
const validJid = (jid: string) => /^\d+@(s\.whatsapp\.net|lid)$/.test(jid);
const MEDIA_BUCKET = "wa-media";
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

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
  return {
    state,
    labels: labels ?? [],
    chats: (chats ?? []).map((c) => ({
      ...c,
      labels: withPending(c),
      customer: c.phone ? (customerOf.get(c.phone) ?? null) : null,
    })),
  };
}

/** Mensajes de un chat (los últimos 200) y lo marca como leído. Incluye los que todavía están en la cola. */
export async function getWaMessages(line: string, jid: string): Promise<WaMessage[]> {
  if (!validLine(line) || !jid) return [];
  const { supabase } = await requireMember();
  const [{ data: msgs }, { data: queued }] = await Promise.all([
    supabase
      .from("wa_messages")
      .select("id, from_me, body, kind, at, sent_by, media_path")
      .eq("line", line)
      .eq("jid", jid)
      .order("at", { ascending: false })
      .limit(200),
    supabase
      .from("wa_outbox")
      .select("id, body, created_at, created_by, error, media_path")
      .eq("line", line)
      .eq("jid", jid)
      .is("sent_at", null)
      .order("created_at"),
  ]);
  await supabase.from("wa_chats").update({ read_at: new Date().toISOString() }).eq("line", line).eq("jid", jid);
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

/** Mandar una foto (con texto opcional): se sube al almacenamiento y queda en la cola para el conector. */
export async function sendWaPhoto(form: FormData): Promise<ActionResult> {
  const line = String(form.get("line") ?? "");
  const jid = String(form.get("jid") ?? "");
  const caption = String(form.get("caption") ?? "")
    .trim()
    .slice(0, 1000);
  const file = form.get("file");
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  if (!validJid(jid)) return { ok: false, error: "Chat inválido." };
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Elegí una foto." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { ok: false, error: "Tiene que ser una foto (JPG o PNG)." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "La foto es muy pesada." };
  const { supabase, me } = await requireMember();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `out/${line}/${randomUUID()}.${ext}`;
  const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type });
  if (up.error) return { ok: false, error: "No se pudo subir la foto. Probá de nuevo." };
  const { error } = await supabase.from("wa_outbox").insert({
    line,
    jid,
    body: caption,
    media_path: path,
    media_type: file.type,
    created_by: me.email,
  });
  if (error) return { ok: false, error: "No se pudo mandar. Probá de nuevo." };
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

/** Desvincular el teléfono (pide un QR nuevo). Solo admin. */
export async function unlinkWaLine(line: string): Promise<ActionResult> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  const { supabase, me } = await requireMember();
  if (!me.is_admin) return { ok: false, error: "Solo el admin puede desvincular." };
  const { error } = await supabase.from("wa_lines").update({ command: "desvincular" }).eq("id", line);
  if (error) return { ok: false, error: "No se pudo." };
  return { ok: true };
}
