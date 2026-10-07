// Traduce los mensajes de WhatsApp (Baileys) a filas para la base del CRM.
// Sin dependencias de red: se puede probar solo (ver mensajes.test.mjs).

const SKIP_TYPES = new Set(["protocolMessage", "reactionMessage", "senderKeyDistributionMessage", "messageContextInfo", "pollUpdateMessage"]);

/** "5491123456789:12@s.whatsapp.net" → "5491123456789@s.whatsapp.net" */
export function normalizeJid(jid) {
  if (!jid) return null;
  const [user, server] = jid.split("@");
  return `${user.split(":")[0]}@${server}`;
}

/**
 * El chat al que pertenece un mensaje. WhatsApp a veces identifica a la persona con un "@lid" (id oculto);
 * si viene el número real en remoteJidAlt, se usa ese para poder unirlo con el cliente del CRM.
 * Devuelve null para grupos, estados, difusiones y canales (no se muestran).
 */
export function chatJid(key) {
  let jid = key?.remoteJid;
  if (!jid) return null;
  if (jid.endsWith("@lid") && key.remoteJidAlt?.endsWith("@s.whatsapp.net")) jid = key.remoteJidAlt;
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return null;
  return normalizeJid(jid);
}

/** Solo dígitos del número, si el chat es un número (no un @lid). */
export function phoneOf(jid) {
  return jid?.endsWith("@s.whatsapp.net") ? jid.split("@")[0] : null;
}

/** Saca los envoltorios (mensajes temporales, "ver una vez", editados…). */
function unwrap(m) {
  let msg = m;
  for (let i = 0; i < 5 && msg; i++) {
    const inner =
      msg.ephemeralMessage?.message ||
      msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message ||
      msg.viewOnceMessageV2Extension?.message ||
      msg.documentWithCaptionMessage?.message ||
      msg.editedMessage?.message;
    if (!inner) break;
    msg = inner;
  }
  return msg;
}

/** { kind, body } del contenido, o null si no es algo para mostrar (reacciones, avisos internos…). */
export function contentOf(message) {
  const m = unwrap(message);
  if (!m) return null;
  const type = Object.keys(m).find((k) => !SKIP_TYPES.has(k));
  if (!type) return null;
  const v = m[type] ?? {};
  switch (type) {
    case "conversation":
      return { kind: "texto", body: String(m.conversation ?? "") };
    case "extendedTextMessage":
      return { kind: "texto", body: v.text ?? "" };
    case "imageMessage":
      return { kind: "foto", body: v.caption ? `📷 ${v.caption}` : "📷 Foto" };
    case "videoMessage":
      return { kind: "video", body: v.caption ? `🎥 ${v.caption}` : "🎥 Video" };
    case "audioMessage":
      return { kind: "audio", body: v.ptt ? "🎤 Audio" : "🎵 Audio" };
    case "documentMessage":
      return { kind: "documento", body: `📄 ${v.fileName || v.caption || "Documento"}` };
    case "stickerMessage":
      return { kind: "sticker", body: "🩷 Sticker" };
    case "locationMessage":
    case "liveLocationMessage":
      return { kind: "otro", body: "📍 Ubicación" };
    case "contactMessage":
    case "contactsArrayMessage":
      return { kind: "otro", body: `👤 Contacto${v.displayName ? `: ${v.displayName}` : ""}` };
    case "buttonsResponseMessage":
      return { kind: "texto", body: v.selectedDisplayText ?? "" };
    case "listResponseMessage":
      return { kind: "texto", body: v.title ?? "" };
    default:
      return { kind: "otro", body: "Mensaje" };
  }
}

/** Si el mensaje es una foto: { size } (bytes, si viene), si no null. */
export function imageOf(message) {
  const img = unwrap(message)?.imageMessage;
  if (!img) return null;
  const n = img.fileLength;
  const size = typeof n === "number" ? n : n && typeof n === "object" && "low" in n ? n.low >>> 0 : Number(n) || null;
  return { size };
}

const MEDIA_TYPES = { imageMessage: "foto", stickerMessage: "sticker", audioMessage: "audio", videoMessage: "video", documentMessage: "documento" };
const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

/**
 * Si el mensaje trae un archivo (foto, sticker, audio, video o documento): { kind, size, type, ext }.
 * type es el tipo de archivo para guardarlo (los documentos raros van como "bin").
 */
export function mediaOf(message) {
  const m = unwrap(message);
  const key = m && Object.keys(MEDIA_TYPES).find((k) => m[k]);
  if (!key) return null;
  const v = m[key];
  const n = v.fileLength;
  const size = typeof n === "number" ? n : n && typeof n === "object" && "low" in n ? n.low >>> 0 : Number(n) || null;
  const mime = String(v.mimetype ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const fallback = { foto: "image/jpeg", sticker: "image/webp", audio: "audio/ogg", video: "video/mp4" }[MEDIA_TYPES[key]];
  const type = EXTENSIONS[mime] ? mime : (fallback ?? "application/octet-stream");
  return { kind: MEDIA_TYPES[key], size, type, ext: EXTENSIONS[type] ?? "bin" };
}

/** Nombre para mostrar de un contacto o chat de WhatsApp: el que tienen agendado en el celu, si no el que se puso la persona. */
export function nameOf(c) {
  const n = c?.name || c?.displayName || c?.notify || c?.verifiedName || c?.username;
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 120) : null;
}

/** Fecha del mensaje (messageTimestamp viene en segundos, a veces como objeto Long). */
export function dateOf(msg) {
  const t = msg?.messageTimestamp;
  const secs = typeof t === "number" ? t : t && typeof t === "object" && "low" in t ? t.low >>> 0 : Number(t);
  return Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000) : new Date();
}

const STATUS_NAMES = { ERROR: 0, PENDING: 1, SERVER_ACK: 2, DELIVERY_ACK: 3, READ: 4, PLAYED: 5 };
/** Estado de un mensaje nuestro (2 enviado, 3 le llegó, 4 lo vio, 5 escuchó), o null si no viene. */
export function statusOf(status) {
  const n = typeof status === "number" ? status : typeof status === "string" ? STATUS_NAMES[status] : null;
  return Number.isInteger(n) && n >= 2 && n <= 5 ? n : null;
}

/**
 * Si el mensaje llegó desde un anuncio de Meta ("Enviar mensaje" en Instagram/Facebook): { id, title, url }.
 * WhatsApp lo marca en el contextInfo (externalAdReply con sourceType "ad" o ctwaClid, o conversionSource de anuncios).
 */
export function adOf(message) {
  const m = unwrap(message);
  if (!m) return null;
  for (const v of Object.values(m)) {
    const ci = v && typeof v === "object" ? v.contextInfo : null;
    if (!ci) continue;
    const ear = ci.externalAdReply;
    // "FB_Ads", "ctwa_ad"… (palabra "ad"/"ads" entera, para no confundir con "broadcast").
    const adWord = /(^|[_\W])ads?($|[_\W])/i;
    const fromAd = ear?.sourceType === "ad" || !!ear?.ctwaClid || adWord.test(ci.conversionSource ?? "") || adWord.test(ci.entryPointConversionSource ?? "");
    if (!fromAd || ci.entryPointConversionSource === "click_to_chat_link") continue;
    const title = (ear?.title || ear?.body || "").trim().slice(0, 200) || null;
    return { id: ear?.sourceId || title || "anuncio", title, url: ear?.sourceUrl || null };
  }
  return null;
}

/** Fila de wa_messages, o null si el mensaje no va (grupo, reacción, etc.). */
export function toRow(line, msg) {
  const jid = chatJid(msg?.key);
  if (!jid || !msg?.key?.id || !msg.message) return null;
  const c = contentOf(msg.message);
  if (!c) return null;
  return {
    line,
    id: msg.key.id,
    jid,
    from_me: !!msg.key.fromMe,
    body: c.body.slice(0, 4000),
    kind: c.kind,
    at: dateOf(msg).toISOString(),
    ...adFields(msg),
  };
}

/** Columnas del anuncio, solo en mensajes que nos mandan desde un anuncio. */
function adFields(msg) {
  const ad = msg.key?.fromMe ? null : adOf(msg.message);
  return ad ? { ad_id: ad.id, ad_title: ad.title, ad_url: ad.url } : {};
}
