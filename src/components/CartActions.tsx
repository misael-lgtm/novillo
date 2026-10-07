"use client";

import Link from "next/link";
import { useState } from "react";
import { createCartOrder } from "@/app/actions";

/** Botones de cada carrito abandonado: escribirle por WhatsApp, copiar el link y pasarlo al tablero. */
export function CartActions({
  cartId,
  phone,
  url,
  message,
  hasCard,
}: {
  cartId: number;
  phone: string | null;
  url: string | null;
  message: string;
  hasCard: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(hasCard);
  return (
    <div className="mt-auto space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {phone ? (
          <Link href={`/telefonos/carritos?${new URLSearchParams({ numero: phone, texto: message })}`} className="btn-primary flex-1 py-2 text-sm">
            💬 Escribirle
          </Link>
        ) : (
          <span className="btn-secondary flex-1 cursor-not-allowed py-2 text-sm opacity-50">Sin celular</span>
        )}
        {url && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setMsg("Link copiado ✔");
              } catch {
                setMsg(url);
              }
            }}
            className="btn-secondary py-2 text-sm"
            title="Copiar el link para que retome la compra"
          >
            🔗 Link
          </button>
        )}
        {!done && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await createCartOrder(cartId);
              setBusy(false);
              if (!r.ok) return setMsg(r.error);
              setDone(true);
              setMsg(r.message ?? "Tarjeta creada ✔");
            }}
            className="btn-secondary py-2 text-sm"
          >
            {busy ? "…" : "➕ Al tablero"}
          </button>
        )}
      </div>
      {msg && <p className="break-all text-xs font-medium text-stone-600">{msg}</p>}
    </div>
  );
}
