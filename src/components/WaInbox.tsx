"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  getWaLine,
  getWaMessages,
  sendWaMessage,
  sendWaPhoto,
  setWaChatLabel,
  unlinkWaLine,
  type WaChat,
  type WaLabel,
  type WaLineState,
  type WaMessage,
} from "@/app/wa-actions";
import { formatPhone } from "@/lib/rules";

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
    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-700">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: labelColor(label) }} aria-hidden />
      {label.name}
    </span>
  );
}

const chatTitle = (c: WaChat) => c.customer?.name ?? c.name ?? (c.phone ? formatPhone(c.phone) : "Sin número");
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
        <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-900">
          ✔ Vinculado{state.phone ? ` · ${formatPhone(state.phone)}` : ""}
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
      <div className="card grid h-[calc(100dvh-24rem)] min-h-96 grid-cols-1 overflow-hidden md:grid-cols-[20rem_1fr]">
        <aside className={`flex min-h-0 flex-col border-stone-200 md:border-r ${open ? "hidden md:flex" : "flex"}`}>
          <div className="space-y-2 border-b border-stone-200 p-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre o número…" className="input py-2" aria-label="Buscar chat" />
            {labels.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar por etiqueta">
                {[{ id: "", name: "Todos", color: null } as WaLabel, ...labels].map((l) => (
                  <button
                    key={l.id || "todos"}
                    onClick={() => setFilter(l.id)}
                    aria-pressed={filter === l.id}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      filter === l.id ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {l.id && <span className="h-2 w-2 rounded-full" style={{ background: labelColor(l) }} aria-hidden />}
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto">
            {chats.map((c) => (
              <li key={c.jid}>
                <button
                  onClick={() => {
                    setOpenJid(c.jid);
                    setOpenChat(c);
                  }}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-stone-50 ${open?.jid === c.jid ? "bg-stone-100" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{chatTitle(c)}</span>
                      <span className="shrink-0 text-xs text-stone-500">{when(c.last_at)}</span>
                    </span>
                    {c.phone && chatTitle(c) !== formatPhone(c.phone) && <span className="block text-xs text-stone-500">{formatPhone(c.phone)}</span>}
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-stone-500">{c.last_message}</span>
                      {c.unread > 0 && <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white">{c.unread}</span>}
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
            {!chats.length && <li className="p-4 text-center text-sm text-stone-500">{q || filter ? "No hay chats con eso." : "Todavía no hay chats."}</li>}
          </ul>
        </aside>
        <section className={`min-h-0 flex-col ${open ? "flex" : "hidden md:flex"}`}>
          {open ? (
            <Conversation key={open.jid} line={line} chat={open} labels={labels} onBack={() => setOpenJid(null)} onSent={load} />
          ) : (
            <div className="m-auto p-6 text-center text-sm text-stone-500">Elegí un chat de la lista.</div>
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
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [sending, setSending] = useState(false);
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

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Eso no es una foto.");
    setError(null);
    try {
      const blob = await shrinkPhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("No se pudo leer la foto. Probá con otra (JPG o PNG).");
    }
  }

  async function send() {
    const body = text.trim();
    if ((!body && !photo) || sending) return;
    setSending(true);
    setError(null);
    let r;
    if (photo) {
      const form = new FormData();
      form.set("line", line);
      form.set("jid", chat.jid);
      form.set("caption", body);
      form.set("file", new File([photo.blob], "foto.jpg", { type: "image/jpeg" }));
      r = await sendWaPhoto(form);
    } else r = await sendWaMessage(line, chat.jid, body);
    setSending(false);
    if (!r.ok) return setError(r.error);
    setText("");
    setPhoto(null);
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
  const showPhone = chat.phone && title !== formatPhone(chat.phone);
  return (
    <>
      <header className="flex items-center gap-3 border-b border-stone-200 px-3 py-2.5">
        <button onClick={onBack} className="text-lg md:hidden" aria-label="Volver a la lista">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="truncate text-xs text-stone-500">
            {showPhone ? formatPhone(chat.phone!) : ""}
            {chat.customer ? (
              <>
                {showPhone ? " · " : ""}
                <Link href={`/clientes/${chat.customer.id}`} className="underline">
                  ver cliente en el CRM
                </Link>
              </>
            ) : (
              chat.phone && (
                <>
                  {showPhone ? " · " : ""}
                  <Link href={`/pedidos/nuevo`} className="underline">
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
            <button onClick={() => setLabelsOpen((v) => !v)} aria-expanded={labelsOpen} className="btn-secondary px-2.5 py-1.5 text-sm">
              🏷️ Etiquetar
            </button>
            {labelsOpen && (
              <div
                className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
                role="group"
                aria-label="Etiquetas del chat"
              >
                {labels.map((l) => {
                  const on = chat.labels.includes(l.id);
                  return (
                    <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50">
                      <input type="checkbox" checked={on} onChange={() => toggleLabel(l.id, !on)} />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: labelColor(l) }} aria-hidden />
                      {l.name}
                    </label>
                  );
                })}
                <p className="px-2 pb-1 pt-1.5 text-[11px] text-stone-500">También se cambia en el WhatsApp del celu.</p>
              </div>
            )}
          </div>
        )}
      </header>
      <div
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-stone-50 p-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm shadow-sm ${
                m.from_me ? "rounded-br-sm bg-emerald-100 text-emerald-950" : "rounded-bl-sm bg-white"
              } ${m.pending ? "opacity-70" : ""}`}
            >
              {m.media_path && (
                <a href={photoUrl(m.media_path)} target="_blank" rel="noreferrer" className="-mx-1 mb-1 block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl(m.media_path)}
                    alt="Foto"
                    loading="lazy"
                    className="max-h-72 rounded-xl"
                    // Al cargar la foto el chat crece: seguir abajo si estaba abajo.
                    onLoad={() => atBottom.current && bottom.current?.scrollIntoView({ block: "end" })}
                  />
                </a>
              )}
              {m.media_path ? (m.body ?? "").replace(/^📷\s?(Foto$)?/, "") : m.body}
              <span className="ml-2 inline-block text-[10px] text-stone-500">
                {m.error ? <span className="text-rose-700">✗ no salió</span> : m.pending ? "⏳" : when(m.at)}
              </span>
            </div>
          </div>
        ))}
        {!msgs.length && <p className="pt-6 text-center text-sm text-stone-500">Sin mensajes todavía.</p>}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-stone-200 p-2"
      >
        {photo && (
          <div className="mb-2 flex items-start gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="Foto para mandar" className="h-24 rounded-lg border border-stone-200" />
            <button type="button" onClick={() => setPhoto(null)} className="text-sm text-stone-500 underline">
              Sacar foto
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Elegir foto"
            onChange={(e) => {
              pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary px-3 py-2" aria-label="Mandar foto" title="Mandar foto">
            📷
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
              const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                pickPhoto(f);
              }
            }}
            rows={1}
            placeholder={photo ? "Texto de la foto (opcional)" : "Escribí un mensaje (Enter manda, Shift+Enter baja de línea)"}
            className="input max-h-32 min-h-10 flex-1 resize-y py-2"
            aria-label="Mensaje"
          />
          <button type="submit" disabled={sending || (!text.trim() && !photo)} className="btn-primary py-2">
            {sending ? "…" : "Mandar"}
          </button>
        </div>
      </form>
      {error && <p className="px-3 pb-2 text-xs font-medium text-rose-700">{error}</p>}
    </>
  );
}
