"use client";

// Panel de la barra de escribir del chat: emojis, stickers y respuestas rápidas (como en WhatsApp Business).

import { useEffect, useState } from "react";
import { deleteWaQuickReply, getWaStickers, saveWaQuickReply, type WaQuickReply } from "@/app/wa-actions";
import { EMOJI_GROUPS } from "@/lib/emojis";

export type PickerTab = "emojis" | "stickers" | "rapidas";

const RECENT_KEY = "wa-emojis-recientes";
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function pushRecent(e: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 24)));
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

export function WaPicker({
  line,
  tab,
  onTab,
  onEmoji,
  onSticker,
  replies,
  onReply,
  onRepliesChanged,
  photoUrl,
}: {
  line: string;
  tab: PickerTab;
  onTab: (t: PickerTab) => void;
  onEmoji: (e: string) => void;
  onSticker: (path: string) => void;
  replies: WaQuickReply[];
  onReply: (r: WaQuickReply) => void;
  onRepliesChanged: () => void;
  photoUrl: (path: string) => string;
}) {
  const tabs: { id: PickerTab; label: string }[] = [
    { id: "emojis", label: "😊 Emojis" },
    { id: "stickers", label: "🩷 Stickers" },
    { id: "rapidas", label: "⚡ Respuestas rápidas" },
  ];
  return (
    <div
      className="mb-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg"
      role="dialog"
      aria-label="Emojis, stickers y respuestas rápidas"
    >
      <div className="flex gap-1 border-b border-stone-200 p-1.5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${tab === t.id ? "bg-emerald-600 text-white" : "text-stone-600 hover:bg-stone-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="h-64 overflow-y-auto p-2">
        {tab === "emojis" && <Emojis onEmoji={onEmoji} />}
        {tab === "stickers" && <Stickers line={line} onSticker={onSticker} photoUrl={photoUrl} />}
        {tab === "rapidas" && <QuickReplies replies={replies} onReply={onReply} onChanged={onRepliesChanged} />}
      </div>
    </div>
  );
}

function Emojis({ onEmoji }: { onEmoji: (e: string) => void }) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => setRecent(readRecent()), []);
  const groups = recent.length ? [{ name: "Recientes", icon: "🕓", emojis: recent }, ...EMOJI_GROUPS] : EMOJI_GROUPS;
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <section key={g.name}>
          <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{g.name}</h3>
          <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-12">
            {g.emojis.map((e, i) => (
              <button
                key={`${e}-${i}`}
                type="button"
                onClick={() => {
                  pushRecent(e);
                  onEmoji(e);
                }}
                className="flex h-9 items-center justify-center rounded-lg text-2xl hover:bg-stone-100"
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Stickers({ line, onSticker, photoUrl }: { line: string; onSticker: (path: string) => void; photoUrl: (path: string) => string }) {
  const [list, setList] = useState<string[] | null>(null);
  useEffect(() => {
    getWaStickers(line).then(setList);
  }, [line]);
  if (!list) return <p className="p-4 text-center text-sm text-stone-500">Cargando…</p>;
  if (!list.length)
    return (
      <p className="p-4 text-center text-sm text-stone-500">
        Todavía no hay stickers. Cuando un cliente (o el celu del local) mande uno, aparece acá para reenviarlo.
      </p>
    );
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {list.map((p) => (
        <button key={p} type="button" onClick={() => onSticker(p)} className="rounded-xl p-1 hover:bg-stone-100" aria-label="Mandar sticker">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(p)} alt="Sticker" loading="lazy" className="aspect-square w-full object-contain" />
        </button>
      ))}
    </div>
  );
}

function QuickReplies({ replies, onReply, onChanged }: { replies: WaQuickReply[]; onReply: (r: WaQuickReply) => void; onChanged: () => void }) {
  const [editing, setEditing] = useState<{ id?: string; shortcut: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const r = await saveWaQuickReply(editing);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setEditing(null);
    onChanged();
  }

  if (editing)
    return (
      <div className="space-y-2 p-1">
        <label className="block text-xs font-semibold text-stone-600">
          Atajo
          <span className="mt-1 flex items-center rounded-lg border border-stone-300 bg-white px-2 focus-within:ring-2 focus-within:ring-emerald-400">
            <span className="text-stone-500">/</span>
            <input
              value={editing.shortcut}
              onChange={(e) => setEditing({ ...editing, shortcut: e.target.value })}
              placeholder="precios"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-normal outline-none"
              aria-label="Atajo"
              autoFocus
            />
          </span>
        </label>
        <label className="block text-xs font-semibold text-stone-600">
          Mensaje
          <textarea
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            rows={4}
            placeholder="Hola! Te paso la lista de precios…"
            className="input mt-1 font-normal"
            aria-label="Texto de la respuesta"
          />
        </label>
        {error && <p className="text-xs font-medium text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={busy} className="btn-primary py-1.5">
            {busy ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" onClick={() => setEditing(null)} className="btn-secondary py-1.5">
            Cancelar
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <p className="text-xs text-stone-500">
          Escribí <b>/</b> en el chat y el atajo. Son las mismas para los 3 teléfonos.
        </p>
        <button
          type="button"
          onClick={() => setEditing({ shortcut: "", body: "" })}
          className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
        >
          + Nueva
        </button>
      </div>
      {!replies.length && <p className="p-4 text-center text-sm text-stone-500">Todavía no hay respuestas rápidas. Creá la primera con “+ Nueva”.</p>}
      {replies.map((r) => (
        <div key={r.id} className="group flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-stone-50">
          <button type="button" onClick={() => onReply(r)} className="min-w-0 flex-1 text-left">
            <span className="text-sm font-semibold text-emerald-700">/{r.shortcut}</span>
            <span className="block truncate text-sm text-stone-600">{r.body}</span>
          </button>
          <button type="button" onClick={() => setEditing(r)} className="text-xs text-stone-500 underline">
            Editar
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`¿Borrar /${r.shortcut}?`)) return;
              await deleteWaQuickReply(r.id);
              onChanged();
            }}
            className="text-xs text-rose-700 underline"
          >
            Borrar
          </button>
        </div>
      ))}
    </div>
  );
}
