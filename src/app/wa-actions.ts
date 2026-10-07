"use server";

// WhatsApp de los locales: el CRM lee lo que guarda el conector (wa-conector/) y deja mensajes en la cola.

import { PHONE_LINES } from "@/lib/config";
import { requireMember } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

const LINE_IDS = PHONE_LINES.map((l) => l.id) as string[];
const validLine = (line: string) => LINE_IDS.includes(line);

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
  customer: { id: string; name: string } | null;
};

export type WaMessage = { id: string; from_me: boolean; body: string | null; kind: string; at: string; sent_by: string | null; pending?: boolean; error?: string | null };

/** Estado del teléfono y su lista de chats (la pantalla la pide cada pocos segundos). */
export async function getWaLine(line: string, q?: string): Promise<{ state: WaLineState; chats: WaChat[] } | null> {
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
    .select("jid, name, phone, last_message, last_at, unread")
    .eq("line", line)
    .order("last_at", { ascending: false, nullsFirst: false })
    .limit(200);
  const term = q?.trim().replace(/[%,()]/g, "");
  if (term) {
    const digits = term.replace(/\D/g, "");
    query = query.or([`name.ilike.%${term}%`, ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : [])].join(","));
  }
  const { data: chats } = await query.returns<Omit<WaChat, "customer">[]>();

  // Unir cada chat con su cliente del CRM (mismo celular).
  const phones = [...new Set((chats ?? []).map((c) => c.phone).filter((p): p is string => !!p))];
  const customerOf = new Map<string, { id: string; name: string }>();
  if (phones.length) {
    const { data: cs } = await supabase.from("customers").select("id, name, phone").in("phone", phones).is("archived_at", null);
    for (const c of cs ?? []) if (c.phone) customerOf.set(c.phone, { id: c.id, name: c.name });
  }
  return { state, chats: (chats ?? []).map((c) => ({ ...c, customer: c.phone ? (customerOf.get(c.phone) ?? null) : null })) };
}

/** Mensajes de un chat (los últimos 200) y lo marca como leído. Incluye los que todavía están en la cola. */
export async function getWaMessages(line: string, jid: string): Promise<WaMessage[]> {
  if (!validLine(line) || !jid) return [];
  const { supabase } = await requireMember();
  const [{ data: msgs }, { data: queued }] = await Promise.all([
    supabase.from("wa_messages").select("id, from_me, body, kind, at, sent_by").eq("line", line).eq("jid", jid).order("at", { ascending: false }).limit(200),
    supabase.from("wa_outbox").select("id, body, created_at, created_by, error").eq("line", line).eq("jid", jid).is("sent_at", null).order("created_at"),
  ]);
  await supabase.from("wa_chats").update({ read_at: new Date().toISOString() }).eq("line", line).eq("jid", jid);
  return [
    ...(msgs ?? []).reverse(),
    ...(queued ?? []).map((o) => ({ id: `cola-${o.id}`, from_me: true, body: o.body, kind: "texto", at: o.created_at, sent_by: o.created_by, pending: true, error: o.error })),
  ];
}

/** Mandar un mensaje: queda en la cola y el conector lo envía en unos segundos. */
export async function sendWaMessage(line: string, jid: string, body: string): Promise<ActionResult> {
  if (!validLine(line)) return { ok: false, error: "Teléfono inválido." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Escribí algo." };
  if (!/^\d+@(s\.whatsapp\.net|lid)$/.test(jid)) return { ok: false, error: "Chat inválido." };
  const { supabase, me } = await requireMember();
  const { error } = await supabase.from("wa_outbox").insert({ line, jid, body: text.slice(0, 4000), created_by: me.email });
  if (error) return { ok: false, error: "No se pudo mandar. Probá de nuevo." };
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
