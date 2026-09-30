"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createExchange } from "@/app/actions";
import { Field, Modal, ResultBanner, SubmitButton, fieldError, useFormAction } from "./ui";

/** Botón "Pedir cambio" (talle / prenda) en pedidos enviados o entregados. */
export function ExchangeButton({ orderId, address }: { orderId: string; address: string | null }) {
  const [open, setOpen] = useState(false);
  const [withDiff, setWithDiff] = useState(false);
  const { state, onSubmit, pending } = useFormAction(createExchange.bind(null, orderId));
  const router = useRouter();
  const err = (f: string) => fieldError(state, f);

  useEffect(() => {
    if (state?.ok && state.data) router.push(`/pedidos/${state.data.id}`);
  }, [state, router]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary w-full sm:w-auto">
        🔄 Pedir cambio
      </button>
      {open && (
        <Modal title="Cambio de talle / prenda" onClose={() => setOpen(false)}>
          <form onSubmit={onSubmit} data-reset="false" className="space-y-4">
            <Field label="¿Qué devuelve y qué se lleva?" name="description" error={err("description")} required>
              <textarea id="description" name="description" rows={3} className="input" placeholder="Ej: Devuelve buzo negro L, se lleva el M" autoFocus aria-invalid={!!err("description")} />
            </Field>
            <Field label="Dirección para mandar la prenda nueva" name="shipping_address" error={err("shipping_address")} required>
              <textarea id="shipping_address" name="shipping_address" rows={2} className="input" defaultValue={address ?? ""} aria-invalid={!!err("shipping_address")} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {[
                [false, "Sin cargo"],
                [true, "Paga diferencia"],
              ].map(([v, label]) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setWithDiff(v as boolean)}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${withDiff === v ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}
                >
                  {label as string}
                </button>
              ))}
            </div>
            {withDiff && (
              <Field label="Diferencia a pagar" name="total" error={err("total")} hint="Queda en Esperando pago hasta que pague" required>
                <input id="total" name="total" inputMode="decimal" className="input" placeholder="$ 5.000" required aria-invalid={!!err("total")} />
              </Field>
            )}
            <p className="text-xs text-stone-500">
              {withDiff ? "Se crea un pedido de cambio en Esperando pago." : "Se crea un pedido de cambio en Pagado, listo para despachar."}
            </p>
            {state && !state.ok && <ResultBanner state={state} />}
            <SubmitButton pending={pending} className="btn-primary w-full">
              Crear cambio
            </SubmitButton>
          </form>
        </Modal>
      )}
    </>
  );
}
