"use client";

// Equipo → Audio del festejo: el admin sube un audio (ej. "Ankara Messi") que suena con cada venta off nueva.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveCelebrationAudio, type AlertSound } from "@/app/goal-actions";

const MAX_BYTES = 650_000;

const TEXTS: Record<AlertSound, { title: string; help: string }> = {
  venta: { title: "🔊 Audio del festejo", help: "Suena cada vez que entra una venta off nueva (en las compus que tengan el CRM abierto y el sonido prendido)." },
  carrito: { title: "🛒 Sonido de carrito nuevo", help: "Suena con el aviso de carrito abandonado nuevo. Si no cargás ninguno, suena un \"ding\"." },
};

export function CelebrationAudioForm({ audio, which = "venta" }: { audio: string | null; which?: AlertSound }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function load(f: File) {
    setMsg(null);
    if (!f.type.startsWith("audio/")) return setMsg("Tiene que ser un audio (MP3, M4A, OGG…).");
    if (f.size > MAX_BYTES) return setMsg("Es muy pesado: recortalo a unos 20-30 segundos (máx. ~650 KB).");
    const r = new FileReader();
    r.onload = () => setPreview(String(r.result));
    r.onerror = () => setMsg("No se pudo leer el audio.");
    r.readAsDataURL(f);
  }

  async function save(value: string | null) {
    setBusy(true);
    const r = await saveCelebrationAudio(value, which);
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setPreview(null);
    setMsg(value ? which === "venta" ? "¡Listo! Suena en el próximo festejo." : "¡Listo! Suena con el próximo carrito." : "Sacado.");
    router.refresh();
  }

  const shown = preview ?? audio;
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-bold">{TEXTS[which].title}</h2>
        <p className="text-sm text-stone-500">{TEXTS[which].help}</p>
      </div>
      {shown && <audio src={shown} controls className="w-full" />}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="btn-secondary cursor-pointer">
          {audio ? "Cambiar audio" : "Subir audio"}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) load(f);
            }}
          />
        </label>
        {preview && (
          <button onClick={() => save(preview)} disabled={busy} className="btn-primary">
            {busy ? "Guardando…" : "Guardar"}
          </button>
        )}
        {audio && !preview && (
          <button onClick={() => save(null)} disabled={busy} className="btn-secondary">
            Sacar audio
          </button>
        )}
      </div>
      {msg && <p className="text-xs font-medium text-stone-600">{msg}</p>}
    </section>
  );
}
