"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  sendWaMessage,
  getWaQuickReplies,
  openWaChatByPhone,
  queueWaPhotos,
  queueWaSticker,
  requestWaHistory,
  setWaChatLabel,
  unlinkWaLine,
  type WaChat,
  type WaLabel,
  type WaLineState,
  type WaMessage,
  type WaQuickReply,
  type WaAdStats,
} from "@/app/wa-actions";
import { WaPicker, type PickerTab } from "./WaPicker";
import { formatPhone } from "@/lib/rules";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 3000;

/** Cada pocos segundos, mientras la pestaña está a la vista (sin pisarse: si la anterior no volvió, espera). */
function usePoll(fn: () => Promise<unknown>, deps: unknown[]) {
  useEffect(() => {
    let busy = false;
    const run = () => {
      if (busy) return;
      busy = true;
      fn()
        .catch(() => {})
        .finally(() => (busy = false));
    };
    run();
    const t = setInterval(() => document.visibilityState === "visible" && run(), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Lecturas que se repiten (chats y mensajes) por rutas GET y no server actions:
 * las server actions salen de a una y frenaban al abrir una conversación.
 */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.headers.get("content-type")?.includes("json")) throw new Error(String(res.status));
  return res.json();
}

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

// Los 20 colores de etiqueta de WhatsApp Business (aproximados).
const LABEL_COLORS = [
  "#ff9485",
  "#64c4ff",
  "#ffd429",
  "#dfaef0",
  "#99b6c1",
  "#55ccb3",
  "#ff9dff",
  "#d3a91d",
  "#6d7cce",
  "#d7e752",
  "#00d0e2",
  "#ffc5c7",
  "#93ceac",
  "#f74848",
  "#00a0f2",
  "#83e422",
  "#ffaf04",
  "#b5ebff",
  "#9ba6ff",
  "#9368cf",
];
const labelColor = (l?: WaLabel) => (l?.color != null ? LABEL_COLORS[l.color % LABEL_COLORS.length] : "#a8a29e");

function LabelChip({ label }: { label: WaLabel }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: labelColor(label) }} aria-hidden />
      {label.name}
    </span>
  );
}

// Colores de las fotitos (de la paleta: en modo oscuro se invierten solos).
const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-pink-100 text-pink-800",
  "bg-orange-100 text-orange-800",
];

/** Círculo con las iniciales del nombre (o 👤 si solo hay número), siempre del mismo color para el mismo chat. */
function Avatar({ chat, size = "md" }: { chat: WaChat; size?: "md" | "sm" }) {
  const name = chat.customer?.name ?? chat.name;
  const initials = name
    ?.replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  let h = 0;
  for (const ch of chat.jid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${AVATAR_COLORS[h % AVATAR_COLORS.length]} ${
        size === "sm" ? "h-10 w-10 text-sm" : "h-11 w-11 text-sm"
      }`}
      aria-hidden
    >
      {initials || <PersonIcon />}
    </span>
  );
}

const svg = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const PersonIcon = () => (
  <svg {...svg} width={18} height={18}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
const SearchIcon = () => (
  <svg {...svg} width={16} height={16}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
const SendIcon = () => (
  <svg {...svg}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const PhotoIcon = () => (
  <svg {...svg}>
    <rect x="3" y="5" width="18" height="15" rx="3" />
    <circle cx="9" cy="11" r="2" />
    <path d="m21 17-5-5-8 8" />
  </svg>
);
const TagIcon = () => (
  <svg {...svg} width={16} height={16}>
    <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>
);
const BackIcon = () => (
  <svg {...svg}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
/** Tildes como en WhatsApp: ✓ enviado, ✓✓ gris le llegó, ✓✓ celeste lo vio. Sin dato (mensajes viejos): ✓✓ gris. */
function Ticks({ status }: { status?: number | null }) {
  const read = (status ?? 0) >= 4;
  const one = status === 2;
  return (
    <svg
      viewBox="0 0 18 12"
      width={16}
      height={11}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={read ? "text-sky-500" : ""}
      aria-label={read ? "visto" : one ? "enviado" : "entregado"}
    >
      <path d={one ? "m3 6.5 3.5 3.5L13 2.5" : "m1 6.5 3.5 3.5L11 2.5M7.5 10 14 2.5"} />
    </svg>
  );
}

/** "Hoy", "Ayer" o la fecha, para separar los mensajes por día. */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}
/** El texto que va abajo del archivo (sin el "📷 Foto", "🎤 Audio", etc. que se guarda para la lista). */
function mediaCaption(m: WaMessage) {
  const body = m.body ?? "";
  if (m.kind === "foto") return body.replace(/^📷\s?(Foto$)?/u, "");
  if (m.kind === "video") return body.replace(/^🎥\s?(Video$)?/u, "");
  if (m.kind === "documento") return "";
  return m.kind === "sticker" || m.kind === "audio" ? "" : body;
}

const SmileIcon = () => (
  <svg {...svg}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
    <circle cx="9" cy="10" r=".8" fill="currentColor" />
    <circle cx="15" cy="10" r=".8" fill="currentColor" />
  </svg>
);

const hourOf = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

/** El número de WhatsApp primero; el nombre solo si no se sabe el número. */
const chatTitle = (c: WaChat) => (c.phone ? formatPhone(c.phone) : (c.customer?.name ?? c.name ?? "Sin número"));
/** El nombre, chiquito abajo del número (si hay los dos). */
const chatSubtitle = (c: WaChat) => (c.phone ? (c.customer?.name ?? c.name) : null);
const MAX_PHOTOS = 30;
/** Filtro especial de la fila de etiquetas: solo los chats sin leer. */
const UNREAD_FILTER = "no-leidos";
const photoUrl = (path: string) => `/api/wa-media?p=${encodeURIComponent(path)}`;

/** Achica la foto en el navegador (máx. 1600 px, JPG) para que suba rápido. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("sin foto"))), "image/jpeg", 0.82));
}

export function WaInbox({
  line,
  short,
  isAdmin,
  connectorHelp,
  initialPhone,
  initialText,
}: {
  line: string;
  short: string;
  isAdmin: boolean;
  connectorHelp: string;
  initialPhone?: string;
  /** Mensaje ya escrito para ese chat (ej. desde Carritos abandonados). */
  initialText?: string;
}) {
  const [state, setState] = useState<WaLineState | null>(null);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [labels, setLabels] = useState<WaLabel[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [openJid, setOpenJid] = useState<string | null>(null);
  const [openChat, setOpenChat] = useState<WaChat | null>(null);
  const [newChat, setNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ jid: string; text: string } | null>(null);

  async function startChat(raw: string) {
    setNewError(null);
    const r = await openWaChatByPhone(line, raw);
    if (!r.ok || !r.data) return setNewError(r.ok ? "No se pudo abrir." : r.error);
    setOpenJid(r.data.jid);
    setOpenChat(r.data);
    setNewChat(false);
    setNewPhone("");
    return r.data.jid;
  }

  // Link directo para escribirle a alguien: /telefonos/carritos?numero=1123456789
  useEffect(() => {
    if (initialPhone)
      startChat(initialPhone).then((jid) => {
        if (jid && initialText) setDraft({ jid, text: initialText });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhone]);
  // El chat abierto, con sus datos al día (etiquetas, nombre) aunque deje de estar en la lista filtrada.
  const open = (openJid && chats.find((c) => c.jid === openJid)) || (openChat?.jid === openJid ? openChat : null);

  const load = useCallback(async () => {
    const r = await getJson<{ state: WaLineState; chats: WaChat[]; labels: WaLabel[] } | null>(
      `/api/wa/chats?${new URLSearchParams({ line, q, label: filter })}`,
    );
    if (!r) return;
    setState(r.state);
    setChats(r.chats);
    setLabels(r.labels);
  }, [line, q, filter]);
  usePoll(load, [load]);

  if (!state) return <div className="card p-6 text-center text-sm text-stone-500">Cargando…</div>;

  if (!state.connectorAlive) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p className="text-4xl" aria-hidden>
          🔌
        </p>
        <h2 className="text-lg font-bold">El conector está apagado</h2>
        <p className="text-sm text-stone-600">
          Para vincular y ver los chats de {short}, el programa <b>Conector de WhatsApp</b> tiene que estar abierto en la compu del local (la que queda
          prendida). Si se apagó la compu, prendela y abrí <b>iniciar.bat</b>.
        </p>
        <a href={connectorHelp} className="text-sm underline">
          ¿Cómo se instala el conector?
        </a>
      </div>
    );
  }

  if (state.status === "esperando_qr" && state.qr) return <QrPanel qr={state.qr} short={short} />;

  if (state.status !== "conectado") {
    return (
      <div className="card p-6 text-center text-sm text-stone-600">
        <p className="text-3xl" aria-hidden>
          ⏳
        </p>
        <p className="mt-2 font-semibold">Conectando el WhatsApp de {short}…</p>
        <p className="mt-1">Si en un minuto no aparece el QR o los chats, revisá que la compu del conector tenga internet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-900">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </span>
          Vinculado{state.phone ? ` · ${formatPhone(state.phone)}` : ""}
        </span>
        {isAdmin && (
          <button
            onClick={async () => {
              if (confirm(`¿Desvincular el WhatsApp de ${short}? Para volver a usarlo hay que escanear el QR de nuevo.`)) await unlinkWaLine(line);
            }}
            className="text-stone-500 underline"
          >
            Desvincular
          </button>
        )}
        <AdCounter line={line} />
      </div>
      <div className="card grid h-[calc(100dvh-22rem)] min-h-[28rem] grid-cols-1 overflow-hidden shadow-sm md:grid-cols-[22rem_1fr]">
        <aside className={`flex min-h-0 flex-col border-stone-200 md:border-r ${open ? "hidden md:flex" : "flex"}`}>
          <div className="space-y-2.5 border-b border-stone-200 p-3">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-stone-100 px-3.5 py-2 text-stone-500 focus-within:ring-2 focus-within:ring-emerald-400">
                <SearchIcon />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar nombre o número…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-500"
                  aria-label="Buscar chat"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setNewChat((v) => !v);
                  setNewError(null);
                }}
                aria-expanded={newChat}
                className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold transition ${
                  newChat ? "bg-stone-200 text-stone-700" : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
                title="Escribirle a un número nuevo"
              >
                {newChat ? "✕" : "+ Nuevo chat"}
              </button>
            </div>
            {newChat && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  startChat(newPhone);
                }}
                className="space-y-2 rounded-2xl bg-emerald-50 p-3"
              >
                <label className="block text-xs font-semibold text-stone-700">
                  Número de WhatsApp
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Ej: 11 2345-6789"
                    inputMode="tel"
                    autoFocus
                    className="input mt-1 py-2 font-normal"
                    aria-label="Número para el chat nuevo"
                  />
                </label>
                {newError && <p className="text-xs font-medium text-rose-700">{newError}</p>}
                <button type="submit" disabled={!newPhone.trim()} className="btn-primary w-full py-2">
                  Abrir chat
                </button>
              </form>
            )}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar por etiqueta">
              {[{ id: "", name: "Todos", color: null } as WaLabel, { id: UNREAD_FILTER, name: "No leídos", color: null } as WaLabel, ...labels].map((l) => (
                <button
                  key={l.id || "todos"}
                  onClick={() => setFilter(l.id)}
                  aria-pressed={filter === l.id}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    filter === l.id ? "bg-emerald-600 text-white shadow-sm" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  {l.id === UNREAD_FILTER ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                  ) : (
                    l.id && <span className="h-2 w-2 rounded-full" style={{ background: labelColor(l) }} aria-hidden />
                  )}
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {chats.map((c) => (
              <li key={c.jid}>
                <button
                  onClick={() => {
                    setOpenJid(c.jid);
                    setOpenChat(c);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-stone-50 ${open?.jid === c.jid ? "bg-emerald-50 hover:bg-emerald-50" : ""}`}
                >
                  <Avatar chat={c} />
                  <span className="min-w-0 flex-1 border-b border-stone-100 pb-2.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{chatTitle(c)}</span>
                      <span className={`shrink-0 text-xs ${c.unread > 0 ? "font-semibold text-emerald-700" : "text-stone-500"}`}>{when(c.last_at)}</span>
                    </span>
                    {(chatSubtitle(c) || c.from_ad_at) && (
                      <span className="flex items-center gap-1.5 text-xs text-stone-500">
                        {c.from_ad_at && (
                          <span
                            className="shrink-0 rounded-full bg-amber-100 px-1.5 font-semibold text-amber-900"
                            title={`Escribió desde el anuncio: ${c.ad_title ?? "sin nombre"}`}
                          >
                            📣 Anuncio
                          </span>
                        )}
                        <span className="truncate">{chatSubtitle(c)}</span>
                      </span>
                    )}
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${c.unread > 0 ? "font-medium text-stone-800" : "text-stone-500"}`}>{c.last_message}</span>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white">
                          {c.unread}
                        </span>
                      )}
                    </span>
                    {c.labels.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {c.labels.map((id) => {
                          const l = labels.find((x) => x.id === id);
                          return l ? <LabelChip key={id} label={l} /> : null;
                        })}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {!chats.length && <li className="p-8 text-center text-sm text-stone-500">{filter === UNREAD_FILTER ? "No hay chats sin leer 🎉" : q || filter ? "No hay chats con eso." : "Todavía no hay chats."}</li>}
          </ul>
        </aside>
        <section className={`min-h-0 flex-col ${open ? "flex" : "hidden md:flex"}`}>
          {open ? (
            <Conversation
              key={open.jid}
              line={line}
              chat={open}
              labels={labels}
              initialText={draft?.jid === open.jid ? draft.text : undefined}
              onBack={() => setOpenJid(null)}
              onSent={() => load().catch(() => {})}
            />
          ) : (
            <div className="m-auto max-w-xs p-6 text-center text-stone-500">
              <p className="text-5xl" aria-hidden>
                💬
              </p>
              <p className="mt-3 font-semibold text-stone-700">WhatsApp de {short}</p>
              <p className="mt-1 text-sm">Elegí un chat de la lista para ver la conversación y responder desde acá.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function QrPanel({ qr, short }: { qr: string; short: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(qr, { margin: 1, width: 280 })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [qr]);
  return (
    <div className="card grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
      <div className="mx-auto rounded-xl bg-white p-3">
        {src ? <img src={src} alt={`QR para vincular el WhatsApp de ${short}`} width={280} height={280} /> : <div className="h-[280px] w-[280px]" />}
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Vincular el WhatsApp de {short}</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Agarrá el celular de <b>{short}</b> y abrí <b>WhatsApp Business</b>.
          </li>
          <li>
            Tocá <b>⋮</b> (o <b>Configuración</b> en iPhone) → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>.
          </li>
          <li>Apuntá el celu a este QR. En unos segundos aparecen los chats acá.</li>
        </ol>
        <p className="text-xs text-stone-500">El QR cambia solo cada tanto: si no te lo toma, esperá que se actualice y probá de nuevo.</p>
      </div>
    </div>
  );
}

function Conversation({
  line,
  chat,
  labels,
  initialText,
  onBack,
  onSent,
}: {
  line: string;
  chat: WaChat;
  labels: WaLabel[];
  initialText?: string;
  onBack: () => void;
  onSent: () => void;
}) {
  const [msgs, setMsgs] = useState<WaMessage[]>([]);
  const [text, setText] = useState(initialText ?? "");
  // Mensaje ya armado (ej. desde Carritos abandonados): queda escrito para revisarlo y mandarlo.
  useEffect(() => {
    if (initialText) setText((t) => t || initialText);
  }, [initialText]);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const [picker, setPicker] = useState<PickerTab | null>(null);
  const [replies, setReplies] = useState<WaQuickReply[]>([]);
  const [slashPick, setSlashPick] = useState(0);
  const loadReplies = useCallback(() => {
    getWaQuickReplies().then(setReplies);
  }, []);
  useEffect(loadReplies, [loadReplies]);

  // "/atajo": sugerir respuestas rápidas mientras se escribe.
  const slash = /^\/(\S*)$/.exec(text);
  const slashMatches = slash ? replies.filter((r) => r.shortcut.includes(slash[1].toLowerCase())).slice(0, 6) : [];
  function useReply(r: WaQuickReply) {
    setText(r.body);
    setPicker(null);
    setSlashPick(0);
    requestAnimationFrame(() => textArea.current?.focus());
  }

  /** Mete un emoji donde está el cursor. */
  function insertEmoji(e: string) {
    const el = textArea.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + e + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + e.length, start + e.length);
    });
  }

  async function sendSticker(path: string) {
    setPicker(null);
    setError(null);
    const r = await queueWaSticker(line, chat.jid, path);
    if (!r.ok) return setError(r.error);
    load().catch(() => {});
    onSent();
  }
  const lastCount = useRef(0);
  const atBottom = useRef(true);

  const [loaded, setLoaded] = useState(false);
  const [askedHistory, setAskedHistory] = useState(false);

  /** Pedirle al celu los mensajes anteriores (los trae el conector en unos segundos). */
  const askHistory = useCallback(async () => {
    setAskedHistory(true);
    try {
      sessionStorage.setItem(`wa-historial:${line}:${chat.jid}`, "1");
    } catch {}
    await requestWaHistory(line, chat.jid);
  }, [line, chat.jid]);
  const load = useCallback(async () => {
    setMsgs(await getJson<WaMessage[]>(`/api/wa/mensajes?${new URLSearchParams({ line, jid: chat.jid })}`));
    setLoaded(true);
  }, [line, chat.jid]);
  usePoll(load, [load]);
  // Si el chat tiene pocos mensajes, pedir los anteriores solo (una vez por chat en esta pestaña).
  useEffect(() => {
    if (!loaded || msgs.length >= 30 || askedHistory) return;
    try {
      if (sessionStorage.getItem(`wa-historial:${line}:${chat.jid}`)) return;
    } catch {}
    askHistory();
  }, [loaded, msgs.length, askedHistory, askHistory, line, chat.jid]);
  useEffect(() => {
    if (msgs.length !== lastCount.current) bottom.current?.scrollIntoView({ block: "end" });
    lastCount.current = msgs.length;
  }, [msgs]);

  // Liberar las vistas previas al cerrar el chat.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function pickPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return files.length && setError("Eso no es una foto.");
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (images.length > room) setError(`Se pueden mandar hasta ${MAX_PHOTOS} fotos juntas: quedaron las primeras.`);
    const added: { blob: Blob; url: string }[] = [];
    for (const f of images.slice(0, Math.max(0, room))) {
      try {
        const blob = await shrinkPhoto(f);
        added.push({ blob, url: URL.createObjectURL(blob) });
      } catch {
        setError("Alguna foto no se pudo leer. Probá con JPG o PNG.");
      }
    }
    setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
  }

  function removePhoto(i: number) {
    URL.revokeObjectURL(photos[i].url);
    setPhotos((prev) => prev.filter((_, j) => j !== i));
  }

  async function send() {
    const body = text.trim();
    if ((!body && !photos.length) || sending) return;
    setSending(true);
    setError(null);
    if (photos.length) {
      // Directo del navegador al almacenamiento, de a 4 a la vez (no pasan por el servidor del CRM).
      const storage = createClient().storage.from("wa-media");
      const paths = photos.map(() => `out/${line}/${crypto.randomUUID()}.jpg`);
      let done = 0;
      let next = 0;
      let failed = false;
      const upload = async (i: number) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const { error } = await storage.upload(paths[i], photos[i].blob, { contentType: "image/jpeg" });
          if (!error) return true;
        }
        return false;
      };
      setProgress(`Subiendo 0 de ${photos.length}…`);
      await Promise.all(
        Array.from({ length: Math.min(4, photos.length) }, async () => {
          while (!failed && next < photos.length) {
            const i = next++;
            if (!(await upload(i))) failed = true;
            else setProgress(`Subiendo ${++done} de ${photos.length}…`);
          }
        }),
      );
      const r = failed
        ? { ok: false as const, error: "No se pudieron subir las fotos. Revisá internet y probá de nuevo." }
        : await queueWaPhotos(line, chat.jid, body, paths);
      if (!r.ok) {
        setSending(false);
        setProgress(null);
        return setError(r.error);
      }
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
    } else {
      const r = await sendWaMessage(line, chat.jid, body);
      if (!r.ok) {
        setSending(false);
        return setError(r.error);
      }
    }
    setSending(false);
    setProgress(null);
    setText("");
    load().catch(() => {});
    onSent();
  }

  async function toggleLabel(id: string, on: boolean) {
    setError(null);
    const r = await setWaChatLabel(line, chat.jid, id, on);
    if (!r.ok) return setError(r.error);
    onSent();
  }

  const title = chatTitle(chat);
  const subtitle = chatSubtitle(chat);
  const canSend = !sending && (!!text.trim() || photos.length > 0);
  return (
    <>
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 py-2.5">
        <button onClick={onBack} className="-ml-1 rounded-full p-1 text-stone-600 hover:bg-stone-100 md:hidden" aria-label="Volver a la lista">
          <BackIcon />
        </button>
        <Avatar chat={chat} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{title}</p>
          <p className="truncate text-xs text-stone-500">
            {subtitle ?? ""}
            {chat.customer ? (
              <>
                {subtitle ? " · " : ""}
                <Link href={`/clientes/${chat.customer.id}`} className="font-medium text-emerald-700 hover:underline">
                  ver ficha en el CRM
                </Link>
              </>
            ) : (
              chat.phone && (
                <>
                  {subtitle ? " · " : ""}
                  <Link href={`/pedidos/nuevo`} className="font-medium text-emerald-700 hover:underline">
                    no está en el CRM: cargar pedido
                  </Link>
                </>
              )
            )}
          </p>
          {chat.labels.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {chat.labels.map((id) => {
                const l = labels.find((x) => x.id === id);
                return l ? <LabelChip key={id} label={l} /> : null;
              })}
            </p>
          )}
        </div>
        {labels.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setLabelsOpen((v) => !v)}
              aria-expanded={labelsOpen}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                labelsOpen ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              <TagIcon />
              Etiquetar
            </button>
            {labelsOpen && (
              <div
                className="absolute right-0 z-20 mt-2 max-h-80 w-60 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl"
                role="group"
                aria-label="Etiquetas del chat"
              >
                {labels.map((l) => {
                  const on = chat.labels.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-stone-50 ${on ? "font-semibold" : ""}`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleLabel(l.id, !on)} className="accent-emerald-600" />
                      <span className="h-3 w-3 rounded-full" style={{ background: labelColor(l) }} aria-hidden />
                      {l.name}
                    </label>
                  );
                })}
                <p className="px-2.5 pb-1 pt-2 text-[11px] text-stone-500">También se cambia en el WhatsApp del celu.</p>
              </div>
            )}
          </div>
        )}
      </header>
      <div
        className="wa-messages min-h-0 flex-1 overflow-y-auto bg-stone-100 px-3 py-4 md:px-8"
        style={{ backgroundImage: "radial-gradient(var(--color-stone-200, #e7e5e4) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {loaded && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={askHistory}
              disabled={askedHistory}
              className="rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-white disabled:text-stone-500"
            >
              {askedHistory ? "⏳ Pidiendo mensajes anteriores al celu…" : "⬆️ Traer mensajes anteriores"}
            </button>
          </div>
        )}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          const firstOfGroup = newDay || prev.from_me !== m.from_me;
          const text = m.media_path ? mediaCaption(m) : m.body;
          const sticker = m.kind === "sticker" && !!m.media_path;
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex justify-center first:mt-0">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-stone-600 shadow-sm first-letter:uppercase">
                    {dayLabel(m.at)}
                  </span>
                </div>
              )}
              <div className={`flex ${m.from_me ? "justify-end" : "justify-start"} ${firstOfGroup ? "mt-2" : "mt-0.5"}`}>
                <div
                  className={`relative max-w-[85%] whitespace-pre-wrap break-words rounded-2xl text-[15px] leading-snug md:max-w-[65%] ${
                    sticker ? "pb-6" : `${m.from_me ? "bg-emerald-100" : "bg-white"} text-stone-900 shadow-sm`
                  } ${firstOfGroup && !sticker ? (m.from_me ? "rounded-tr-md" : "rounded-tl-md") : ""} ${m.pending ? "opacity-75" : ""} ${
                    m.media_path ? "p-1" : "px-3 py-1.5"
                  }`}
                >
                  {m.media_path && <MediaView m={m} onLoad={() => atBottom.current && bottom.current?.scrollIntoView({ block: "end" })} />}
                  <span className={m.media_path ? (text ? "block px-2 pb-1 pt-1.5" : "") : ""}>
                    {text}
                    {/* Hueco para que la hora no pise el texto */}
                    <span className="inline-block w-[4.75rem]" aria-hidden />
                  </span>
                  <span
                    className={`absolute bottom-1 right-2 flex items-center gap-1 text-[11px] ${
                      m.media_path && !text && (m.kind === "foto" || m.kind === "video" || sticker)
                        ? "rounded-full bg-black/45 px-1.5 py-0.5 text-[#fff]"
                        : "text-stone-500"
                    }`}
                  >
                    {m.error ? (
                      <span className="font-semibold text-rose-700">✗ no salió</span>
                    ) : (
                      <>
                        {hourOf(m.at)}
                        {m.from_me && (m.pending ? <span aria-label="enviando">🕓</span> : <Ticks status={m.status} />)}
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {!loaded && !msgs.length && (
          <p className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-full bg-white/90 px-4 py-1.5 text-sm text-stone-500 shadow-sm">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden />
            Cargando mensajes…
          </p>
        )}
        {loaded && !msgs.length && (
          <p className="mx-auto mt-6 w-fit rounded-full bg-white/90 px-4 py-1.5 text-center text-sm text-stone-500 shadow-sm">Sin mensajes todavía.</p>
        )}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-stone-200 bg-stone-50 px-2 py-2 md:px-3"
      >
        {photos.length > 0 && (
          <div className="mb-2 rounded-2xl bg-white p-2 shadow-sm">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <div key={p.url} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="Foto para mandar" className="h-20 w-20 rounded-xl object-cover" />
                  {!sending && (
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] font-bold text-[#fff] hover:bg-black/80"
                      aria-label={`Sacar foto ${i + 1}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {photos.length < MAX_PHOTOS && !sending && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 text-2xl text-stone-400 hover:border-emerald-400 hover:text-emerald-600"
                  aria-label="Agregar más fotos"
                >
                  +
                </button>
              )}
            </div>
            <p className="px-1 text-xs text-stone-500">
              {progress ?? `${photos.length} ${photos.length === 1 ? "foto" : "fotos"} (hasta ${MAX_PHOTOS}).`}{" "}
              {!sending && (
                <button
                  type="button"
                  onClick={() => {
                    photos.forEach((p) => URL.revokeObjectURL(p.url));
                    setPhotos([]);
                  }}
                  className="font-medium underline"
                >
                  Sacar todas
                </button>
              )}
            </p>
          </div>
        )}
        {slashMatches.length > 0 && (
          <ul className="mb-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg" role="listbox" aria-label="Respuestas rápidas">
            {slashMatches.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === slashPick}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => useReply(r)}
                  className={`block w-full px-3 py-2 text-left ${i === slashPick ? "bg-emerald-50" : "hover:bg-stone-50"}`}
                >
                  <span className="text-sm font-semibold text-emerald-700">/{r.shortcut}</span>
                  <span className="block truncate text-sm text-stone-600">{r.body}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {slash && !slashMatches.length && (
          <p className="mb-2 rounded-2xl bg-white px-3 py-2 text-sm text-stone-500 shadow-sm">
            {replies.length ? "Ninguna respuesta rápida con ese atajo." : "Todavía no hay respuestas rápidas."}{" "}
            <button type="button" onClick={() => setPicker("rapidas")} className="font-medium text-emerald-700 underline">
              Crear una
            </button>
          </p>
        )}
        {picker && (
          <WaPicker
            line={line}
            tab={picker}
            onTab={setPicker}
            onEmoji={insertEmoji}
            onSticker={sendSticker}
            replies={replies}
            onReply={useReply}
            onRepliesChanged={loadReplies}
            photoUrl={photoUrl}
          />
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="Elegir fotos"
            onChange={(e) => {
              pickPhotos([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <div className="flex min-h-11 flex-1 items-end rounded-3xl bg-white px-1.5 shadow-sm ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-emerald-400">
            <button
              type="button"
              onClick={() => setPicker((p) => (p ? null : "emojis"))}
              aria-expanded={!!picker}
              className={`my-1 ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-stone-100 ${picker ? "text-emerald-700" : "text-stone-500"}`}
              aria-label="Emojis, stickers y respuestas rápidas"
              title="Emojis, stickers y respuestas rápidas"
            >
              <SmileIcon />
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="my-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-emerald-700"
              aria-label="Mandar fotos"
              title="Mandar fotos (hasta 30)"
            >
              <PhotoIcon />
            </button>
            <textarea
              ref={textArea}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSlashPick(0);
              }}
              onKeyDown={(e) => {
                if (slashMatches.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const d = e.key === "ArrowDown" ? 1 : -1;
                    return setSlashPick((i) => (i + d + slashMatches.length) % slashMatches.length);
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    return useReply(slashMatches[Math.min(slashPick, slashMatches.length - 1)]);
                  }
                }
                if (e.key === "Escape" && picker) return setPicker(null);
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onPaste={(e) => {
                const files = [...e.clipboardData.files].filter((x) => x.type.startsWith("image/"));
                if (files.length) {
                  e.preventDefault();
                  pickPhotos(files);
                }
              }}
              rows={1}
              placeholder={photos.length ? "Texto para la primera foto (opcional)" : "Escribí un mensaje o / para respuestas rápidas"}
              className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] outline-none placeholder:text-stone-500"
              aria-label="Mensaje"
            />
          </div>
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Mandar"
            title="Mandar (Enter)"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <SendIcon />}
          </button>
        </div>
      </form>
      {error && <p className="px-3 pb-2 text-xs font-medium text-rose-700">{error}</p>}
    </>
  );
}

/** Lo que trae un mensaje: foto, sticker, audio, video o documento. */
function MediaView({ m, onLoad }: { m: WaMessage; onLoad: () => void }) {
  const url = photoUrl(m.media_path!);
  if (m.kind === "audio")
    return (
      <div className="flex min-w-60 items-center gap-2 px-1.5 pt-1.5 pb-5">
        <span aria-hidden className="text-xl">
          🎤
        </span>
        <audio controls preload="none" src={url} className="h-9 w-full min-w-48" />
      </div>
    );
  if (m.kind === "video")
    return <video controls preload="metadata" src={url} className="max-h-80 min-w-48 rounded-xl bg-stone-900" onLoadedMetadata={onLoad} />;
  if (m.kind === "documento")
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mb-4 flex min-w-56 items-center gap-3 rounded-xl bg-stone-100/70 px-3 py-2.5 hover:bg-stone-100"
        download={m.media_path!.endsWith(".bin") ? (m.body ?? "documento").replace(/^📄\s?/u, "") : undefined}
      >
        <span className="text-2xl" aria-hidden>
          📄
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{(m.body ?? "Documento").replace(/^📄\s?/u, "")}</span>
          <span className="text-xs text-emerald-700">Abrir / descargar</span>
        </span>
      </a>
    );
  const sticker = m.kind === "sticker";
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={sticker ? "Sticker" : "Foto"}
        loading="lazy"
        className={sticker ? "h-32 w-32 object-contain" : "max-h-80 min-h-24 min-w-40 rounded-xl bg-stone-200 object-cover"}
        // Al cargar la foto el chat crece: seguir abajo si estaba abajo.
        onLoad={onLoad}
      />
    </a>
  );
}

/** Mensajes de anuncios de Meta de hoy (se reinicia a las 00) y, al lado, los de ayer. Al tocarlo, el detalle por anuncio. */
function AdCounter({ line }: { line: string }) {
  const [stats, setStats] = useState<WaAdStats | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      getJson<WaAdStats | null>(`/api/wa/anuncios?line=${line}`)
        .then((r) => alive && setStats(r))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [line]);
  if (!stats) return null;
  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full bg-amber-100 py-1 pl-3 pr-1 font-semibold text-amber-900 hover:bg-amber-200"
        title="Mensajes que entraron desde anuncios de Meta (Instagram/Facebook). Se reinicia a las 00."
      >
        📣 Anuncios hoy:{" "}
        <span className="text-base" aria-label="hoy">
          {stats.today}
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-600" aria-label="ayer">
          Ayer {stats.yesterday}
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-stone-200 bg-white p-3 text-sm shadow-xl"
          role="dialog"
          aria-label="Detalle por anuncio"
        >
          <p className="mb-2 grid grid-cols-[1fr_3rem_3rem] gap-2 text-xs font-semibold text-stone-500">
            <span>Anuncio</span>
            <span className="text-right">Hoy</span>
            <span className="text-right">Ayer</span>
          </p>
          {stats.byAd.length ? (
            <ul className="space-y-1">
              {stats.byAd.map((a) => (
                <li key={a.title} className="grid grid-cols-[1fr_3rem_3rem] gap-2">
                  <span className="min-w-0 truncate">{a.title}</span>
                  <b className="text-right">{a.today}</b>
                  <span className="text-right text-stone-500">{a.yesterday}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-stone-500">Ni hoy ni ayer entraron mensajes desde anuncios.</p>
          )}
          <p className="mt-2 text-[11px] text-stone-500">Cuenta una vez por persona y por día. Empezó a contar cuando se actualizó el conector.</p>
        </div>
      )}
    </div>
  );
}
