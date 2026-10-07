// node --test wa-conector/mensajes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatJid, contentOf, dateOf, imageOf, nameOf, phoneOf, toRow } from "./mensajes.mjs";

test("chat: número normal, con el :dispositivo sacado", () => {
  assert.equal(chatJid({ remoteJid: "5491123456789:3@s.whatsapp.net" }), "5491123456789@s.whatsapp.net");
});

test("chat: @lid usa el número real si viene en remoteJidAlt", () => {
  assert.equal(chatJid({ remoteJid: "12345@lid", remoteJidAlt: "5491123456789@s.whatsapp.net" }), "5491123456789@s.whatsapp.net");
  assert.equal(chatJid({ remoteJid: "12345@lid" }), "12345@lid");
});

test("chat: grupos, estados y canales no van", () => {
  assert.equal(chatJid({ remoteJid: "1203@g.us" }), null);
  assert.equal(chatJid({ remoteJid: "status@broadcast" }), null);
  assert.equal(chatJid({ remoteJid: "1203@newsletter" }), null);
});

test("teléfono solo si es un número", () => {
  assert.equal(phoneOf("5491123456789@s.whatsapp.net"), "5491123456789");
  assert.equal(phoneOf("12345@lid"), null);
});

test("contenido: texto, foto con texto, audio, temporal, reacción", () => {
  assert.deepEqual(contentOf({ conversation: "hola" }), { kind: "texto", body: "hola" });
  assert.deepEqual(contentOf({ extendedTextMessage: { text: "¿tenés en L?" } }), { kind: "texto", body: "¿tenés en L?" });
  assert.deepEqual(contentOf({ imageMessage: { caption: "esta" } }), { kind: "foto", body: "📷 esta" });
  assert.deepEqual(contentOf({ audioMessage: { ptt: true } }), { kind: "audio", body: "🎤 Audio" });
  assert.deepEqual(contentOf({ ephemeralMessage: { message: { conversation: "temporal" } } }), { kind: "texto", body: "temporal" });
  assert.equal(contentOf({ reactionMessage: { text: "❤️" } }), null);
  assert.equal(contentOf({ protocolMessage: {} }), null);
  assert.deepEqual(contentOf({ messageContextInfo: {}, conversation: "con contexto" }), { kind: "texto", body: "con contexto" });
});

test("fecha: segundos o Long", () => {
  assert.equal(dateOf({ messageTimestamp: 1790000000 }).toISOString(), new Date(1790000000 * 1000).toISOString());
  assert.equal(dateOf({ messageTimestamp: { low: 1790000000, high: 0 } }).toISOString(), new Date(1790000000 * 1000).toISOString());
});

test("fila completa", () => {
  const row = toRow("carritos", {
    key: { remoteJid: "5491123456789@s.whatsapp.net", id: "ABC", fromMe: false },
    message: { conversation: "Hola, ¿precio del Alaska?" },
    messageTimestamp: 1790000000,
  });
  assert.deepEqual(row, {
    line: "carritos",
    id: "ABC",
    jid: "5491123456789@s.whatsapp.net",
    from_me: false,
    body: "Hola, ¿precio del Alaska?",
    kind: "texto",
    at: new Date(1790000000 * 1000).toISOString(),
  });
  assert.equal(toRow("carritos", { key: { remoteJid: "1@g.us", id: "x" }, message: { conversation: "grupo" } }), null);
});

test("foto: tamaño, también dentro de un temporal; lo demás no es foto", () => {
  assert.deepEqual(imageOf({ imageMessage: { fileLength: 12345 } }), {
    size: 12345,
  });
  assert.deepEqual(
    imageOf({
      ephemeralMessage: {
        message: { imageMessage: { fileLength: { low: 99, high: 0 } } },
      },
    }),
    { size: 99 },
  );
  assert.equal(imageOf({ conversation: "hola" }), null);
  assert.equal(imageOf({ videoMessage: {} }), null);
});

test("nombre: agendado primero, si no el que se puso la persona", () => {
  assert.equal(nameOf({ name: "Juan Tienda", notify: "Juancito" }), "Juan Tienda");
  assert.equal(nameOf({ notify: " Juancito " }), "Juancito");
  assert.equal(nameOf({ id: "1@lid" }), null);
});
