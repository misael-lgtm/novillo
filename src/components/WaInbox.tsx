"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { getWaLine, getWaMessages, sendWaMessage, unlinkWaLine, type WaChat, type WaLineState, type WaMessage } from "@/app/wa-actions";
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
  return today
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function WaInbox({ line, short, isAdmin, connectorHelp }: { line: string; short: string; isAdmin: boolean; connectorHelp: string }) {
  const [state, setState] = useState<WaLineState | null>(null);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<WaChat | null>(null);

  const load = useCallback(async () => {
    const r = await getWaLine(line, q);
    if (!r) return;
    setState(r.state);
    setChats(r.chats);
  }, [line, q]);
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
          <div className="border-b border-stone-200 p-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre o número…" className="input py-2" aria-label="Buscar chat" />
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto">
            {chats.map((c) => (
              <li key={c.jid}>
                <button
                  onClick={() => setOpen(c)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-stone-50 ${open?.jid === c.jid ? "bg-stone-100" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{c.customer?.name ?? c.name ?? (c.phone ? formatPhone(c.phone) : "Sin nombre")}</span>
                      <span className="shrink-0 text-xs text-stone-500">{when(c.last_at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-stone-500">{c.last_message}</span>
                      {c.unread > 0 && (
                        <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white">{c.unread}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {!chats.length && <li className="p-4 text-center text-sm text-stone-500">{q ? "No hay chats con eso." : "Todavía no hay chats."}</li>}
          </ul>
        </aside>
        <section className={`min-h-0 flex-col ${open ? "flex" : "hidden md:flex"}`}>
          {open ? (
            <Conversation key={open.jid} line={line} chat={open} onBack={() => setOpen(null)} onSent={load} />
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
    QRCode.toDataURL(qr, { margin: 1, width: 280 }).then(setSrc).catch(() => setSrc(null));
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

function Conversation({ line, chat, onBack, onSent }: { line: string; chat: WaChat; onBack: () => void; onSent: () => void }) {
  const [msgs, setMsgs] = useState<WaMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => setMsgs(await getWaMessages(line, chat.jid)), [line, chat.jid]);
  usePoll(load, [load]);
  useEffect(() => {
    if (msgs.length !== lastCount.current) bottom.current?.scrollIntoView({ block: "end" });
    lastCount.current = msgs.length;
  }, [msgs]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const r = await sendWaMessage(line, chat.jid, body);
    setSending(false);
    if (!r.ok) return setError(r.error);
    setText("");
    load();
    onSent();
  }

  const title = chat.customer?.name ?? chat.name ?? (chat.phone ? formatPhone(chat.phone) : "Sin nombre");
  return (
    <>
      <header className="flex items-center gap-3 border-b border-stone-200 px-3 py-2.5">
        <button onClick={onBack} className="text-lg md:hidden" aria-label="Volver a la lista">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="truncate text-xs text-stone-500">
            {chat.phone ? formatPhone(chat.phone) : ""}
            {chat.customer ? (
              <>
                {" · "}
                <Link href={`/clientes/${chat.customer.id}`} className="underline">
                  ver cliente en el CRM
                </Link>
              </>
            ) : (
              chat.phone && (
                <>
                  {" · "}
                  <Link href={`/pedidos/nuevo`} className="underline">
                    no está en el CRM: cargar pedido
                  </Link>
                </>
              )
            )}
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-stone-50 p-3">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm shadow-sm ${
                m.from_me ? "rounded-br-sm bg-emerald-100 text-emerald-950" : "rounded-bl-sm bg-white"
              } ${m.pending ? "opacity-70" : ""}`}
            >
              {m.body}
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
        className="flex items-end gap-2 border-t border-stone-200 p-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Escribí un mensaje (Enter manda, Shift+Enter baja de línea)"
          className="input max-h-32 min-h-10 flex-1 resize-y py-2"
          aria-label="Mensaje"
        />
        <button type="submit" disabled={sending || !text.trim()} className="btn-primary py-2">
          {sending ? "…" : "Mandar"}
        </button>
      </form>
      {error && <p className="px-3 pb-2 text-xs font-medium text-rose-700">{error}</p>}
    </>
  );
}
