"use client";

import { useState, useTransition } from "react";
import { moveOrder, updateOrder } from "@/app/actions";
import { CARRIERS, CHANNELS, LOST_STAGE, PAYMENT_METHODS, STAGES, nextStage, type StageId } from "@/lib/config";
import { STAGE_REQUIREMENTS, missingForStage, type RequiredField } from "@/lib/rules";
import type { OrderWithCustomer, TeamMember } from "@/lib/types";
import { StageMoveDialog } from "./StageMoveDialog";
import { Field, ResultBanner, SubmitButton, fieldError, useFormAction } from "./ui";

export function StageControls({ order }: { order: OrderWithCustomer }) {
  const [dialog, setDialog] = useState<{ target: StageId; missing: RequiredField[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const currentIdx = STAGES.findIndex((s) => s.id === order.stage);

  function go(target: StageId) {
    setError(null);
    const missing = missingForStage(order, target);
    if (missing.length) return setDialog({ target, missing });
    start(async () => {
      const r = await moveOrder(order.id, target);
      if (!r.ok) setError(r.error);
    });
  }

  const next = nextStage(order.stage);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s, i) => {
          const current = s.id === order.stage;
          return (
            <button
              key={s.id}
              disabled={current || pending}
              onClick={() => go(s.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                current
                  ? "border-stone-900 bg-stone-900 text-white"
                  : i < currentIdx && s.id !== LOST_STAGE
                    ? "border-stone-200 text-stone-400 hover:border-stone-400"
                    : s.id === LOST_STAGE
                      ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                      : "border-stone-300 hover:bg-stone-100"
              }`}
            >
              {current && "● "}
              {s.label}
            </button>
          );
        })}
      </div>
      {next && (
        <button disabled={pending} onClick={() => go(next.id)} className="btn-primary w-full sm:w-auto">
          {pending ? "Moviendo…" : `Pasar a ${next.label} →`}
        </button>
      )}
      {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
      {dialog && (
        <StageMoveDialog order={order} target={dialog.target} missing={dialog.missing} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />
      )}
    </section>
  );
}

export function OrderEditForm({ order, team }: { order: OrderWithCustomer; team: TeamMember[] }) {
  const { state, onSubmit, pending } = useFormAction(updateOrder.bind(null, order.id));
  const required = new Set<RequiredField>(STAGE_REQUIREMENTS[order.stage]);
  const err = (f: string) => fieldError(state, f);
  const disabled = !!order.archived_at;

  return (
    <form onSubmit={onSubmit} data-reset="false" className="card space-y-4 p-5">
      <h2 className="text-lg font-bold">Datos del pedido</h2>
      <fieldset disabled={disabled} className="space-y-4">
        <Field label="¿Qué quiere?" name="description" error={err("description")} required>
          <textarea id="description" name="description" rows={3} defaultValue={order.description} className="input" aria-invalid={!!err("description")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Monto total" name="total" error={err("total")} required={required.has("total")} hint="Ej: 45000 o 45.000">
            <input id="total" name="total" inputMode="decimal" defaultValue={order.total ?? ""} className="input" aria-invalid={!!err("total")} />
          </Field>
          <Field label="Medio de pago" name="payment_method" error={err("payment_method")} required={required.has("payment_method")}>
            <select id="payment_method" name="payment_method" defaultValue={order.payment_method ?? ""} className="input" aria-invalid={!!err("payment_method")}>
              <option value="">— Todavía no pagó —</option>
              {PAYMENT_METHODS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Dirección de envío" name="shipping_address" error={err("shipping_address")} required={required.has("shipping_address")} hint="Calle, número, piso/depto, localidad, provincia, CP">
          <textarea id="shipping_address" name="shipping_address" rows={2} defaultValue={order.shipping_address ?? ""} className="input" aria-invalid={!!err("shipping_address")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Correo" name="carrier" error={err("carrier")} required={required.has("carrier")}>
            <select id="carrier" name="carrier" defaultValue={order.carrier ?? ""} className="input" aria-invalid={!!err("carrier")}>
              <option value="">— Sin despachar —</option>
              {CARRIERS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Número de seguimiento" name="tracking_code" error={err("tracking_code")} required={required.has("tracking_code")}>
            <input id="tracking_code" name="tracking_code" defaultValue={order.tracking_code ?? ""} className="input" autoCapitalize="characters" aria-invalid={!!err("tracking_code")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Canal" name="channel" error={err("channel")} required>
            <select id="channel" name="channel" defaultValue={order.channel} className="input">
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Lo sigue" name="assigned_to" error={err("assigned_to")} required>
            <select id="assigned_to" name="assigned_to" defaultValue={order.assigned_to} className="input">
              {team
                .filter((m) => m.active || m.email === order.assigned_to)
                .map((m) => (
                  <option key={m.email} value={m.email}>{m.name}</option>
                ))}
            </select>
          </Field>
        </div>
        {order.stage === LOST_STAGE && (
          <Field label="Motivo de cancelación" name="cancel_reason" error={err("cancel_reason")} required>
            <input id="cancel_reason" name="cancel_reason" defaultValue={order.cancel_reason ?? ""} className="input" />
          </Field>
        )}
        <ResultBanner state={state} />
        {!disabled && <SubmitButton pending={pending}>Guardar cambios</SubmitButton>}
      </fieldset>
    </form>
  );
}
