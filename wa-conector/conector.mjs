// Conector de WhatsApp para el CRM de Wayfarer.
// Corre en una compu (o un Android con Termux) que queda prendida. Mantiene vinculados por QR los
// teléfonos de los locales ("Dispositivos vinculados") y los conecta con el CRM a través de la base:
//   - deja el QR en wa_lines para que el CRM lo muestre;
//   - guarda chats y mensajes que llegan o se mandan;
//   - manda lo que el CRM deja en wa_outbox.
// Las credenciales de WhatsApp quedan en la carpeta "sesiones" de esta compu (no en la base).
//
// Uso: completar el archivo .env (ver .env.ejemplo) y ejecutar "iniciar.bat" (Windows) o "node conector.mjs".

import { readFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "baileys";
import { createClient } from "@supabase/supabase-js";
import pino from "pino";
import { chatJid, phoneOf, toRow } from "./mensajes.mjs";

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
const LINES = (process.env.LINEAS || ALL_LINES.join(",")).split(",").map((x) => x.trim()).filter((x) => ALL_LINES.includes(x));
const SESSIONS = join(HERE, "sesiones");
// Del historial que manda WhatsApp al vincular, guardar solo lo de los últimos N días.
const HISTORY_DAYS = Number(process.env.DIAS_DE_HISTORIAL || 30);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el archivo .env (ver .env.ejemplo).");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });
const log = (line, ...msg) => console.log(new Date().toLocaleString("es-AR"), `[${line}]`, ...msg);

// ── Base ──────────────────────────────────────────────────────
async function setLine(line, patch) {
  const { error } = await db.from("wa_lines").update({ ...patch, seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", line);
  if (error) log(line, "no se pudo actualizar el estado:", error.message);
}

async function saveMessages(line, msgs, { history = false } = {}) {
  const since = Date.now() - HISTORY_DAYS * 86400000;
  const rows = [];
  const names = new Map();
  for (const m of msgs) {
    const row = toRow(line, m);
    if (!row) continue;
    if (history && Date.parse(row.at) < since) continue;
    rows.push(row);
    if (!m.key.fromMe && m.pushName) names.set(row.jid, m.pushName);
  }
  if (!rows.length) return;
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
      p_phone: phoneOf(jid),
      p_name: names.get(jid) ?? null,
      p_last_message: (r.from_me ? "Vos: " : "") + (r.body ?? ""),
      p_last_at: r.at,
    });
    if (error) log(line, "no se pudo actualizar el chat:", error.message);
  }
}

// ── Un teléfono ───────────────────────────────────────────────
const sockets = new Map();

async function startLine(line) {
  const { state, saveCreds } = await useMultiFileAuthState(join(SESSIONS, line));
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
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
    }
    if (connection === "close") {
      sockets.delete(line);
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        log(line, "se desvinculó: se va a pedir un QR nuevo");
        rmSync(join(SESSIONS, line), { recursive: true, force: true });
        await setLine(line, { status: "desconectado", qr: null, phone: null });
        setTimeout(() => startLine(line), 2000);
      } else {
        log(line, "se cortó la conexión, reintentando…", code ?? "");
        await setLine(line, { status: "conectando" });
        setTimeout(() => startLine(line), 5000);
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages }) => saveMessages(line, messages).catch((e) => log(line, e.message)));
  sock.ev.on("messaging-history.set", ({ messages }) => saveMessages(line, messages, { history: true }).catch((e) => log(line, e.message)));
}

// ── Cola de salida (lo que escriben desde el CRM) y pedidos del CRM ──
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const { data: pending } = await db
      .from("wa_outbox")
      .select("id, line, jid, body, created_by")
      .is("sent_at", null)
      .is("error", null)
      .in("line", LINES)
      .order("created_at")
      .limit(20);
    for (const p of pending ?? []) {
      const sock = sockets.get(p.line);
      if (!sock?.user) continue; // ese teléfono todavía no está conectado: queda en la cola
      try {
        const sent = await sock.sendMessage(p.jid, { text: p.body });
        const at = new Date().toISOString();
        await db.from("wa_messages").upsert(
          { line: p.line, id: sent.key.id, jid: chatJid(sent.key) ?? p.jid, from_me: true, body: p.body, kind: "texto", at, sent_by: p.created_by },
          { onConflict: "line,id" },
        );
        await db.from("wa_outbox").update({ sent_at: at, wa_id: sent.key.id }).eq("id", p.id);
        await db.rpc("wa_touch_chat", { p_line: p.line, p_jid: p.jid, p_phone: phoneOf(p.jid), p_name: null, p_last_message: `Vos: ${p.body}`, p_last_at: at });
      } catch (e) {
        log(p.line, "no se pudo mandar:", e.message);
        await db.from("wa_outbox").update({ error: String(e.message).slice(0, 300) }).eq("id", p.id);
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
