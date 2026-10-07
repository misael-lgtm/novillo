"use client";

import { useEffect, useState } from "react";
import { PHONE_LINES } from "@/lib/config";

// Qué teléfono quedó vinculado en este navegador (WhatsApp Web admite una sola cuenta por navegador/perfil).
const KEY = "crm_wa_line";
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (v: string | null) => {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {}
};

export function WhatsAppLine({ id, label, short }: { id: string; label: string; short: string }) {
  const [linked, setLinked] = useState<string | null>(null);
  useEffect(() => setLinked(read()), []);
  const linkedLabel = PHONE_LINES.find((l) => l.id === linked)?.short;
  const other = linked && linked !== id;

  function open() {
    // Ventana con nombre propio: si ya está abierta, la vuelve a usar en vez de abrir otra.
    window.open("https://web.whatsapp.com/", `wa-${id}`);
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-6 text-center">
        <p className="text-5xl" aria-hidden>
          💬
        </p>
        <h2 className="text-xl font-bold">{label}</h2>
        {linked === id && <p className="text-sm font-semibold text-emerald-700">✔ Este navegador tiene vinculado el WhatsApp de {short}.</p>}
        {other && (
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Ojo: en este navegador está vinculado <b>{linkedLabel}</b>. Si abrís acá vas a ver los chats de {linkedLabel}, no los de {short}. Para {short} usá
            otro perfil de Chrome (ver abajo).
          </p>
        )}
        <button onClick={open} className="btn-primary px-6 py-3 text-base">
          Abrir WhatsApp Business de {short}
        </button>
        <p className="text-xs text-stone-500">Se abre en otra ventana. Si ya estaba abierta, te lleva a esa.</p>
      </div>

      <details className="card p-5" open={!linked}>
        <summary className="cursor-pointer font-semibold">Primera vez: vincular el teléfono de {short} con el QR</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Tocá <b>Abrir WhatsApp Business de {short}</b>. En la ventana nueva aparece un <b>código QR</b>.
          </li>
          <li>
            Agarrá el celular de <b>{short}</b> y abrí <b>WhatsApp Business</b>.
          </li>
          <li>
            Tocá <b>⋮</b> (o <b>Configuración</b> en iPhone) → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>.
          </li>
          <li>Apuntá el celu al QR de la pantalla. Listo: los chats de {short} aparecen en la compu.</li>
          <li>
            Volvé acá y tocá:{" "}
            <button
              onClick={() => {
                write(id);
                setLinked(id);
              }}
              className="btn-secondary ml-1 py-1.5"
            >
              Ya vinculé {short} en este navegador
            </button>
          </li>
        </ol>
        <p className="mt-3 text-xs text-stone-500">El QR lo genera WhatsApp y dura poco: si se vence, en esa ventana tocá “Volver a cargar el código”.</p>
      </details>

      <details className="card p-5">
        <summary className="cursor-pointer font-semibold">¿Querés tener los 3 teléfonos abiertos en la misma compu?</summary>
        <div className="mt-3 space-y-2 text-sm">
          <p>
            WhatsApp Web permite <b>una sola cuenta por navegador</b>. Para tener Carritos, Güemes y Palermo a la vez, usá un <b>perfil de Chrome</b> para cada
            uno:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              En Chrome, tocá tu foto arriba a la derecha → <b>Agregar</b> → creá un perfil llamado “Carritos” (después “Güemes” y “Palermo”).
            </li>
            <li>En cada perfil entrá al CRM, andá a su pestaña y vinculá su teléfono (paso de arriba).</li>
            <li>Cada perfil queda con su WhatsApp. Cambiás de uno a otro desde la foto de Chrome.</li>
          </ol>
        </div>
        {linked && (
          <button
            onClick={() => {
              write(null);
              setLinked(null);
            }}
            className="mt-3 text-xs text-stone-500 underline"
          >
            Olvidar qué teléfono está vinculado en este navegador
          </button>
        )}
      </details>
    </div>
  );
}
