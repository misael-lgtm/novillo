"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  getWaLine,
  getWaMessages,
  sendWaMessage,
  queueWaPhotos,
  setWaChatLabel,
  unlinkWaLine,
  type WaChat,
  type WaLabel,
  type WaLineState,
  type WaMessage,
} from "@/app/wa-actions";
import { formatPhone } from "@/lib/rules";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 3000;

/** Cada pocos segundos, mientras la pestaña está a la vista. */
function usePoll(fn: () => void, deps: unknown[]) {
  useEffect(() => {
    fn();
    const t = setInterval(() => document.visibilityState === "visible" && fn(), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
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
/** Tilde de enviado (dos tildes cuando ya salió por WhatsApp). */
const Ticks = () => (
  <svg
    viewBox="0 0 18 12"
    width={15}
    height={10}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="enviado"
  >
    <path d="m1 6.5 3.5 3.5L11 2.5M7.5 10 14 2.5" />
  </svg>
);

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
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

/** El número de WhatsApp primero; el nombre solo si no se sabe el número. */
const chatTitle = (c: WaChat) => (c.phone ? formatPhone(c.phone) : (c.customer?.name ?? c.name ?? "Sin número"));
/** El nombre, chiquito abajo del número (si hay los dos). */
const chatSubtitle = (c: WaChat) => (c.phone ? (c.customer?.name ?? c.name) : null);
const MAX_PHOTOS = 30;
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

export function WaInbox({ line, short, isAdmin, connectorHelp }: { line: string; short: string; isAdmin: boolean; connectorHelp: string }) {
  const [state, setState] = useState<WaLineState | null>(null);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [labels, setLabels] = useState<WaLabel[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [openJid, setOpenJid] = useState<string | null>(null);
  const [openChat, setOpenChat] = useState<WaChat | null>(null);
  // El chat abierto, con sus datos al día (etiquetas, nombre) aunque deje de estar en la lista filtrada.
  const open = (openJid && chats.find((c) => c.jid === openJid)) || (openChat?.jid === openJid ? openChat : null);

  const load = useCallback(async () => {
    const r = await getWaLine(line, q, filter || undefined);
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
      </div>
      <div className="card grid h-[calc(100dvh-22rem)] min-h-[28rem] grid-cols-1 overflow-hidden shadow-sm md:grid-cols-[22rem_1fr]">
        <aside className={`flex min-h-0 flex-col border-stone-200 md:border-r ${open ? "hidden md:flex" : "flex"}`}>
          <div className="space-y-2.5 border-b border-stone-200 p-3">
            <label className="flex items-center gap-2 rounded-full bg-stone-100 px-3.5 py-2 text-stone-500 focus-within:ring-2 focus-within:ring-emerald-400">
              <SearchIcon />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar nombre o número…"
                className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-500"
                aria-label="Buscar chat"
              />
            </label>
            {labels.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar por etiqueta">
                {[{ id: "", name: "Todos", color: null } as WaLabel, ...labels].map((l) => (
                  <button
                    key={l.id || "todos"}
                    onClick={() => setFilter(l.id)}
                    aria-pressed={filter === l.id}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                      filter === l.id ? "bg-emerald-600 text-white shadow-sm" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    {l.id && <span className="h-2 w-2 rounded-full" style={{ background: labelColor(l) }} aria-hidden />}
                    {l.name}
                  </button>
                ))}
              </div>
            )}
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
                    {chatSubtitle(c) && <span className="block truncate text-xs text-stone-500">{chatSubtitle(c)}</span>}
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
            {!chats.length && <li className="p-8 text-center text-sm text-stone-500">{q || filter ? "No hay chats con eso." : "Todavía no hay chats."}</li>}
          </ul>
        </aside>
        <section className={`min-h-0 flex-col ${open ? "flex" : "hidden md:flex"}`}>
          {open ? (
            <Conversation key={open.jid} line={line} chat={open} labels={labels} onBack={() => setOpenJid(null)} onSent={load} />
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

function Conversation({ line, chat, labels, onBack, onSent }: { line: string; chat: WaChat; labels: WaLabel[]; onBack: () => void; onSent: () => void }) {
  const [msgs, setMsgs] = useState<WaMessage[]>([]);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastCount = useRef(0);
  const atBottom = useRef(true);

  const load = useCallback(async () => setMsgs(await getWaMessages(line, chat.jid)), [line, chat.jid]);
  usePoll(load, [load]);
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
    load();
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
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          const firstOfGroup = newDay || prev.from_me !== m.from_me;
          const text = m.media_path ? (m.body ?? "").replace(/^📷\s?(Foto$)?/, "") : m.body;
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
                  className={`relative max-w-[85%] whitespace-pre-wrap break-words rounded-2xl text-[15px] leading-snug shadow-sm md:max-w-[65%] ${
                    m.from_me ? "bg-emerald-100 text-stone-900" : "bg-white text-stone-900"
                  } ${firstOfGroup ? (m.from_me ? "rounded-tr-md" : "rounded-tl-md") : ""} ${m.pending ? "opacity-75" : ""} ${
                    m.media_path ? "p-1" : "px-3 py-1.5"
                  }`}
                >
                  {m.media_path && (
                    <a href={photoUrl(m.media_path)} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl(m.media_path)}
                        alt="Foto"
                        loading="lazy"
                        className="max-h-80 min-h-24 min-w-40 rounded-xl bg-stone-200 object-cover"
                        // Al cargar la foto el chat crece: seguir abajo si estaba abajo.
                        onLoad={() => atBottom.current && bottom.current?.scrollIntoView({ block: "end" })}
                      />
                    </a>
                  )}
                  <span className={m.media_path ? (text ? "block px-2 pb-1 pt-1.5" : "") : ""}>
                    {text}
                    {/* Hueco para que la hora no pise el texto */}
                    <span className="inline-block w-16" aria-hidden />
                  </span>
                  <span
                    className={`absolute bottom-1 right-2 flex items-center gap-1 text-[11px] ${
                      m.media_path && !text ? "rounded-full bg-black/45 px-1.5 py-0.5 text-[#fff]" : "text-stone-500"
                    }`}
                  >
                    {m.error ? (
                      <span className="font-semibold text-rose-700">✗ no salió</span>
                    ) : (
                      <>
                        {hourOf(m.at)}
                        {m.from_me &&
                          (m.pending ? (
                            <span aria-label="enviando">🕓</span>
                          ) : (
                            <span className="text-sky-600">
                              <Ticks />
                            </span>
                          ))}
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {!msgs.length && (
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
              onClick={() => fileInput.current?.click()}
              className="m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-emerald-700"
              aria-label="Mandar fotos"
              title="Mandar fotos (hasta 30)"
            >
              <PhotoIcon />
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
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
              placeholder={photos.length ? "Texto para la primera foto (opcional)" : "Escribí un mensaje"}
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
