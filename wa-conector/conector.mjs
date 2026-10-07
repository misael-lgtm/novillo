// Conector de WhatsApp para el CRM de Wayfarer.
// Corre en una compu (o un Android con Termux) que queda prendida. Mantiene vinculados por QR los
// teléfonos de los locales ("Dispositivos vinculados") y los conecta con el CRM a través de la base:
//   - deja el QR en wa_lines para que el CRM lo muestre;
//   - guarda chats y mensajes que llegan o se mandan;
//   - manda lo que el CRM deja en wa_outbox (texto o foto);
//   - guarda las fotos que llegan (bucket "wa-media") y las etiquetas de WhatsApp Business;
//   - pone o saca etiquetas cuando lo piden desde el CRM (wa_label_ops).
// Las credenciales de WhatsApp quedan en la carpeta "sesiones" de esta compu (no en la base).
//
// Uso: completar el archivo .env (ver .env.ejemplo) y ejecutar "iniciar.bat" (Windows) o "node conector.mjs".

import { readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, { ALL_WA_PATCH_NAMES, Browsers, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, useMultiFileAuthState } from "baileys";
import { createClient } from "@supabase/supabase-js";
import pino from "pino";
import { chatJid, mediaOf, nameOf, normalizeJid, phoneOf, toRow } from "./mensajes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Configuración (.env al lado de este archivo) ──────────────
function loadEnv() {
  const file = join(HERE, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALL_LINES = ["carritos", "guemes", "palermo"];
const LINES = (process.env.LINEAS || ALL_LINES.join(","))
  .split(",")
  .map((x) => x.trim())
  .filter((x) => ALL_LINES.includes(x));
const SESSIONS = join(HERE, "sesiones");
// Del historial que manda WhatsApp al vincular, guardar solo lo de los últimos N días.
const HISTORY_DAYS = Number(process.env.DIAS_DE_HISTORIAL || 30);
const MEDIA_BUCKET = "wa-media";
const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // como el límite de WhatsApp

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el archivo .env (ver .env.ejemplo).");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });
const log = (line, ...msg) => console.log(new Date().toLocaleString("es-AR"), `[${line}]`, ...msg);

// ── Base ──────────────────────────────────────────────────────
async function setLine(line, patch) {
  const { error } = await db
    .from("wa_lines")
    .update({
      ...patch,
      seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", line);
  if (error) log(line, "no se pudo actualizar el estado:", error.message);
}

// Fotos que mandó el CRM: no hace falta bajarlas de WhatsApp otra vez.
const sentFromCrm = new Set();

/** Número real de los chats "@lid" (WhatsApp guarda la relación en la sesión). */
async function phonesOf(line, jids) {
  const out = new Map();
  const lids = [...new Set(jids.filter((j) => j?.endsWith("@lid")))];
  const sock = sockets.get(line);
  if (!lids.length || !sock?.signalRepository?.lidMapping) return out;
  for (let i = 0; i < lids.length; i += 200) {
    const pairs = await sock.signalRepository.lidMapping.getPNsForLIDs(lids.slice(i, i + 200)).catch(() => null);
    for (const p of pairs ?? []) {
      const phone = phoneOf(normalizeJid(p.pn));
      if (phone) out.set(normalizeJid(p.lid), phone);
    }
  }
  return out;
}

/** Baja el archivo de un mensaje (foto, sticker, audio, video o documento) y lo sube al bucket. Devuelve la ruta o null. */
async function saveMedia(line, m) {
  const media = mediaOf(m.message);
  if (!media || (media.size && media.size > MAX_MEDIA_BYTES) || sentFromCrm.has(m.key.id)) return null;
  const sock = sockets.get(line);
  try {
    const buf = await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock?.updateMediaMessage });
    if (buf.length > MAX_MEDIA_BYTES) return null;
    const path = `in/${line}/${String(m.key.id).replace(/[^\w-]/g, "_")}.${media.ext}`;
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, buf, { contentType: media.type, upsert: true });
    if (error) throw new Error(error.message);
    return path;
  } catch (e) {
    log(line, `no se pudo guardar un archivo (${media.kind}):`, e.message);
    return null;
  }
}

async function saveMessages(line, msgs, { history = false } = {}) {
  const since = Date.now() - HISTORY_DAYS * 86400000;
  const rows = [];
  const names = new Map();
  for (const m of msgs) {
    const row = toRow(line, m);
    if (!row) continue;
    if (history && Date.parse(row.at) < since) continue;
    // Fotos, stickers, audios, videos y documentos nuevos se guardan para verlos en el CRM (los del historial no: serían demasiados).
    if (!history) {
      const path = await saveMedia(line, m);
      if (path) row.media_path = path;
    }
    rows.push(row);
    if (!m.key.fromMe && m.pushName) names.set(row.jid, m.pushName);
  }
  if (!rows.length) return;
  const phones = await phonesOf(
    line,
    rows.map((r) => r.jid),
  );
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("wa_messages").upsert(rows.slice(i, i + 500), { onConflict: "line,id" });
    if (error) log(line, "no se pudieron guardar mensajes:", error.message);
  }
  // Último mensaje de cada chat
  const last = new Map();
  for (const r of rows) if (!last.has(r.jid) || last.get(r.jid).at < r.at) last.set(r.jid, r);
  for (const [jid, r] of last) {
    const { error } = await db.rpc("wa_touch_chat", {
      p_line: line,
      p_jid: jid,
      p_phone: phoneOf(jid) ?? phones.get(jid) ?? null,
      p_name: names.get(jid) ?? null,
      p_last_message: (r.from_me ? "Vos: " : "") + (r.body ?? ""),
      p_last_at: r.at,
    });
    if (error) log(line, "no se pudo actualizar el chat:", error.message);
  }
}

/** Todos los chats guardados de un teléfono: jid → { phone, name } (se recuerda un minuto: los contactos llegan de a uno). */
const chatsCache = new Map();
async function storedChats(line) {
  const hit = chatsCache.get(line);
  if (hit && Date.now() - hit.at < 60000) return hit.chats;
  const chats = await loadChats(line);
  chatsCache.set(line, { at: Date.now(), chats });
  return chats;
}
async function loadChats(line) {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("wa_chats")
      .select("jid, phone, name")
      .eq("line", line)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) out.set(c.jid, c);
    if (!data || data.length < 1000) return out;
  }
}

/** Nombres y números de los contactos de WhatsApp en los chats que ya están guardados. */
async function saveContacts(line, list) {
  if (!list?.length) return;
  const chats = await storedChats(line);
  let n = 0;
  for (const c of list) {
    const ids = [c.id, c.lid, c.phoneNumber, c.pnJid, c.lidJid].filter((x) => typeof x === "string").map(normalizeJid);
    const phone = ids.map(phoneOf).find(Boolean) ?? null;
    const name = nameOf(c);
    for (const jid of new Set(ids)) {
      const chat = chats.get(jid);
      if (!chat) continue;
      const patch = {};
      if (name && name !== chat.name) patch.name = name;
      if (phone && !chat.phone) patch.phone = phone;
      if (!Object.keys(patch).length) continue;
      const { error } = await db.from("wa_chats").update(patch).eq("line", line).eq("jid", jid);
      if (!error) {
        Object.assign(chat, patch);
        n++;
      }
    }
  }
  if (n) log(line, `nombres/números actualizados en ${n} chats`);
}

/** Los chats "@lid" que quedaron sin número: buscarlo en la sesión de WhatsApp. */
async function fillMissingPhones(line) {
  const chats = await loadChats(line);
  const missing = [...chats.values()].filter((c) => !c.phone && c.jid.endsWith("@lid")).map((c) => c.jid);
  const phones = await phonesOf(line, missing);
  for (const [jid, phone] of phones) await db.from("wa_chats").update({ phone }).eq("line", line).eq("jid", jid).is("phone", null);
  if (phones.size) log(line, `se encontró el número de ${phones.size} chats`);
}

/** El jid con el que guardamos un chat (WhatsApp a veces lo nombra por el número y a veces por el @lid). */
async function storedJid(line, jid) {
  const j = normalizeJid(jid);
  const sock = sockets.get(line);
  let other = null;
  if (j.endsWith("@lid")) other = await sock?.signalRepository?.lidMapping?.getPNForLID(j).catch(() => null);
  else other = await sock?.signalRepository?.lidMapping?.getLIDForPN(j).catch(() => null);
  const candidates = [j, other && normalizeJid(other)].filter(Boolean);
  const { data } = await db.from("wa_chats").select("jid").eq("line", line).in("jid", candidates);
  return data?.[0]?.jid ?? candidates.find((x) => x.endsWith("@s.whatsapp.net")) ?? j;
}

async function saveLabel(line, l) {
  if (!l?.id) return;
  const row = {
    line,
    id: String(l.id),
    name: l.name || "Etiqueta",
    color: l.color ?? null,
    deleted: !!l.deleted,
  };
  const { error } = await db.from("wa_labels").upsert(row, { onConflict: "line,id" });
  if (error) log(line, "no se pudo guardar una etiqueta:", error.message);
  if (row.deleted) await db.from("wa_chat_labels").delete().eq("line", line).eq("label_id", row.id);
}

async function saveLabelAssociation(line, { association, type }) {
  // Baileys marca las de chat como "label_jid" (las de mensaje, "label_message": esas no van).
  if (association?.type !== "label_jid" || !association.chatId) return;
  const jid = await storedJid(line, association.chatId);
  const row = { line, jid, label_id: String(association.labelId) };
  const { error } =
    type === "add" ? await db.from("wa_chat_labels").upsert(row, { onConflict: "line,jid,label_id" }) : await db.from("wa_chat_labels").delete().match(row);
  if (error) log(line, "no se pudo guardar la etiqueta del chat:", error.message);
}

/**
 * Una sola vez por teléfono: pedirle a WhatsApp todo de nuevo (etiquetas, contactos) porque las versiones
 * anteriores del conector no lo guardaban. Queda una marca en la carpeta de la sesión para no repetirlo.
 */
async function fullResyncOnce(line, sock, keys) {
  // "-2": la primera vez no se guardaban qué chat tenía cada etiqueta, así que se pide todo de nuevo.
  const mark = join(SESSIONS, line, "crm-resync-2");
  if (existsSync(mark)) return;
  try {
    await keys.set({
      "app-state-sync-version": Object.fromEntries(ALL_WA_PATCH_NAMES.map((n) => [n, null])),
    });
    await sock.resyncAppState(ALL_WA_PATCH_NAMES, true);
    writeFileSync(mark, new Date().toISOString());
    log(line, "etiquetas y contactos sincronizados");
  } catch (e) {
    log(line, "no se pudieron traer etiquetas/contactos (se reintenta la próxima vez):", e.message);
  }
}

// ── Un teléfono ───────────────────────────────────────────────
const sockets = new Map();

async function startLine(line) {
  const { state, saveCreds } = await useMultiFileAuthState(join(SESSIONS, line));
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: undefined,
  }));
  const sock = makeWASocket({
    auth: state,
    version,
    logger,
    browser: Browsers.windows(`Wayfarer CRM ${line}`),
    markOnlineOnConnect: false, // que el celu siga recibiendo las notificaciones
    syncFullHistory: false,
  });
  sockets.set(line, sock);
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      log(line, "esperando que escaneen el QR desde el CRM");
      await setLine(line, { status: "esperando_qr", qr });
    }
    if (connection === "connecting") await setLine(line, { status: "conectando" });
    if (connection === "open") {
      const phone = sock.user?.id ? sock.user.id.split(":")[0].split("@")[0] : null;
      log(line, "conectado", phone ?? "");
      await setLine(line, { status: "conectado", qr: null, phone });
      // Con un rato de margen para que WhatsApp termine lo que manda al conectarse.
      setTimeout(async () => {
        if (sockets.get(line) !== sock) return;
        await fullResyncOnce(line, sock, state.keys);
        await fillMissingPhones(line).catch((e) => log(line, e.message));
      }, 20000);
    }
    if (connection === "close") {
      sockets.delete(line);
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        log(line, "se desvinculó: se va a pedir un QR nuevo");
        rmSync(join(SESSIONS, line), { recursive: true, force: true });
        await setLine(line, {
          status: "desconectado",
          qr: null,
          phone: null,
        });
        setTimeout(() => startLine(line), 2000);
      } else {
        log(line, "se cortó la conexión, reintentando…", code ?? "");
        await setLine(line, { status: "conectando" });
        setTimeout(() => startLine(line), 5000);
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages }) => saveMessages(line, messages).catch((e) => log(line, e.message)));
  sock.ev.on("messaging-history.set", async ({ messages, contacts, chats }) => {
    try {
      await saveMessages(line, messages, { history: true });
      await saveContacts(line, [...(contacts ?? []), ...(chats ?? [])]);
    } catch (e) {
      log(line, e.message);
    }
  });
  sock.ev.on("contacts.upsert", (list) => saveContacts(line, list).catch((e) => log(line, e.message)));
  sock.ev.on("contacts.update", (list) => saveContacts(line, list).catch((e) => log(line, e.message)));
  sock.ev.on("lid-mapping.update", async ({ lid, pn }) => {
    const phone = phoneOf(normalizeJid(pn));
    if (lid && phone) await db.from("wa_chats").update({ phone }).eq("line", line).eq("jid", normalizeJid(lid)).is("phone", null);
  });
  sock.ev.on("labels.edit", (l) => saveLabel(line, l).catch((e) => log(line, e.message)));
  sock.ev.on("labels.association", (a) => saveLabelAssociation(line, a).catch((e) => log(line, e.message)));
}

// ── Cola de salida (lo que escriben desde el CRM) y pedidos del CRM ──
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const { data: pending } = await db
      .from("wa_outbox")
      .select("id, line, jid, body, created_by, media_path, media_type, media_kind")
      .is("sent_at", null)
      .is("error", null)
      .in("line", LINES)
      .order("created_at")
      .limit(20);
    for (const p of pending ?? []) {
      const sock = sockets.get(p.line);
      if (!sock?.user) continue; // ese teléfono todavía no está conectado: queda en la cola
      try {
        // Chat nuevo (escrito desde "+ Nuevo chat"): fijarse que el número tenga WhatsApp.
        if (p.jid.endsWith("@s.whatsapp.net")) {
          const { count } = await db.from("wa_chats").select("jid", { count: "exact", head: true }).eq("line", p.line).eq("jid", p.jid);
          if (!count) {
            const [found] = await sock.onWhatsApp(p.jid.split("@")[0]).catch(() => [null]);
            if (found && !found.exists) throw new Error("Ese número no tiene WhatsApp");
          }
        }
        let sent, body, kind;
        if (p.media_path) {
          const { data: file, error } = await db.storage.from(MEDIA_BUCKET).download(p.media_path);
          if (error || !file) throw new Error(`no se encontró el archivo (${error?.message ?? "vacío"})`);
          const buf = Buffer.from(await file.arrayBuffer());
          if (p.media_kind === "sticker") {
            sent = await sock.sendMessage(p.jid, { sticker: buf });
            body = "🩷 Sticker";
            kind = "sticker";
          } else {
            sent = await sock.sendMessage(p.jid, { image: buf, caption: p.body?.trim() || undefined, mimetype: p.media_type || "image/jpeg" });
            body = p.body?.trim() ? `📷 ${p.body.trim()}` : "📷 Foto";
            kind = "foto";
          }
          sentFromCrm.add(sent.key.id);
          // Cuando mandan muchas juntas, de a una con un respiro (como haría una persona).
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          sent = await sock.sendMessage(p.jid, { text: p.body });
          body = p.body;
          kind = "texto";
        }
        const at = new Date().toISOString();
        await db.from("wa_messages").upsert(
          {
            line: p.line,
            id: sent.key.id,
            jid: chatJid(sent.key) ?? p.jid,
            from_me: true,
            body,
            kind,
            at,
            sent_by: p.created_by,
            ...(p.media_path ? { media_path: p.media_path } : {}),
          },
          { onConflict: "line,id" },
        );
        await db.from("wa_outbox").update({ sent_at: at, wa_id: sent.key.id }).eq("id", p.id);
        await db.rpc("wa_touch_chat", {
          p_line: p.line,
          p_jid: p.jid,
          p_phone: phoneOf(p.jid),
          p_name: null,
          p_last_message: `Vos: ${body}`,
          p_last_at: at,
        });
      } catch (e) {
        log(p.line, "no se pudo mandar:", e.message);
        await db
          .from("wa_outbox")
          .update({ error: String(e.message).slice(0, 300) })
          .eq("id", p.id);
      }
    }

    // Etiquetas que ponen o sacan desde el CRM
    const { data: ops } = await db
      .from("wa_label_ops")
      .select("id, line, jid, label_id, op")
      .is("done_at", null)
      .is("error", null)
      .in("line", LINES)
      .order("created_at")
      .limit(20);
    for (const o of ops ?? []) {
      const sock = sockets.get(o.line);
      if (!sock?.user) continue;
      try {
        // WhatsApp identifica muchos chats por el @lid: usar ese si lo conocemos.
        const lid = o.jid.endsWith("@s.whatsapp.net") ? await sock.signalRepository?.lidMapping?.getLIDForPN(o.jid).catch(() => null) : null;
        const target = lid ? normalizeJid(lid) : o.jid;
        if (o.op === "poner") await sock.addChatLabel(target, o.label_id);
        else await sock.removeChatLabel(target, o.label_id);
        const row = { line: o.line, jid: o.jid, label_id: o.label_id };
        if (o.op === "poner") await db.from("wa_chat_labels").upsert(row, { onConflict: "line,jid,label_id" });
        else await db.from("wa_chat_labels").delete().match(row);
        await db.from("wa_label_ops").update({ done_at: new Date().toISOString() }).eq("id", o.id);
      } catch (e) {
        log(o.line, "no se pudo cambiar la etiqueta:", e.message);
        await db
          .from("wa_label_ops")
          .update({ error: String(e.message).slice(0, 300) })
          .eq("id", o.id);
      }
    }

    const { data: cmds } = await db.from("wa_lines").select("id, command").in("id", LINES).not("command", "is", null);
    for (const c of cmds ?? []) {
      await db.from("wa_lines").update({ command: null }).eq("id", c.id);
      if (c.command === "desvincular") {
        log(c.id, "desvinculando a pedido del CRM");
        const sock = sockets.get(c.id);
        if (sock) await sock.logout().catch(() => {});
        else {
          rmSync(join(SESSIONS, c.id), { recursive: true, force: true });
          startLine(c.id);
        }
      }
    }
  } catch (e) {
    console.error("Error revisando la cola:", e.message);
  } finally {
    busy = false;
  }
}

// Señal de vida: el CRM avisa si el conector deja de responder.
async function heartbeat() {
  await db.from("wa_lines").update({ seen_at: new Date().toISOString() }).in("id", LINES);
}

console.log(`Conector de WhatsApp de Wayfarer — teléfonos: ${LINES.join(", ")}. No cierres esta ventana.`);
for (const line of LINES) startLine(line).catch((e) => log(line, "no arrancó:", e.message));
setInterval(tick, 2000);
setInterval(() => heartbeat().catch(() => {}), 30000);
heartbeat().catch(() => {});
