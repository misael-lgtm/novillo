"use client";

import { useState, useTransition } from "react";
import { moveOrder } from "@/app/actions";
import { CARRIERS, PAYMENT_METHODS, STAGES, type StageId } from "@/lib/config";
import { FIELD_LABELS, type RequiredField } from "@/lib/rules";
import type { ActionResult } from "@/lib/types";
import { Field, Modal, ResultBanner } from "./ui";

/**
 * Se abre cuando alguien quiere pasar un pedido a una etapa y faltan datos.
 * Pide SOLO lo que falta, y no deja avanzar sin eso.
 */
export function StageMoveDialog({
  order,
  target,
  missing,
  onClose,
  onDone,
}: {
  order: { id: string; number: number; shipping_address?: string | null };
  target: StageId;
  missing: RequiredField[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const stage = STAGES.find((s) => s.id === target)!;
  const err = (f: string) => (state && !state.ok ? state.fields?.[f] : undefined);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await moveOrder(order.id, target, fd);
      setState(res);
      if (res.ok) onDone();
    });
  }

  return (
    <Modal title={`#${order.number} → ${stage.label}`} onClose={onClose}>
      <p className="mb-4 text-sm text-stone-600">Para pasarlo a <b>{stage.label}</b> completá esto:</p>
      <form onSubmit={submit} className="space-y-4">
        {missing.map((f) => (
          <MissingInput key={f} field={f} error={err(f)} />
        ))}
        <ResultBanner state={state} />
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={pending}>
            {pending ? "Guardando…" : `Pasar a ${stage.label}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MissingInput({ field, error }: { field: RequiredField; error?: string }) {
  const label = FIELD_LABELS[field];
  const common = { id: field, name: field, required: true, "aria-invalid": !!error, className: "input" } as const;

  switch (field) {
    case "total":
      return (
        <Field label={label} name={field} error={error} hint="Ej: 45000 o 45.000" required>
          <input {...common} inputMode="decimal" placeholder="$ 45.000" autoFocus />
        </Field>
      );
    case "payment_method":
      return (
        <Field label={label} name={field} error={error} required>
          <RadioGroup name={field} options={PAYMENT_METHODS} />
        </Field>
      );
    case "carrier":
      return (
        <Field label={label} name={field} error={error} required>
          <RadioGroup name={field} options={CARRIERS} />
        </Field>
      );
    case "shipping_address":
      return (
        <Field label={label} name={field} error={error} hint="Calle, número, piso/depto, localidad, provincia, CP" required>
          <textarea {...common} rows={3} />
        </Field>
      );
    case "tracking_code":
      return (
        <Field label={label} name={field} error={error} hint="Copialo tal cual del comprobante del correo" required>
          <input {...common} autoCapitalize="characters" autoComplete="off" />
        </Field>
      );
    case "cancel_reason":
      return (
        <Field label={label} name={field} error={error} required>
          <CancelReason />
        </Field>
      );
  }
}

export function RadioGroup({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: readonly { id: string; label: string }[];
  defaultValue?: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <label
          key={o.id}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white"
        >
          <input type="radio" name={name} value={o.id} required defaultChecked={defaultValue === o.id} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

const CANCEL_REASONS = ["No respondió más", "Le pareció caro", "No había talle/color", "Compró en otro lado", "Se arrepintió"];

function CancelReason() {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {CANCEL_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setValue(r)}
            className={`rounded-full border px-3 py-1 text-sm ${value === r ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <input id="cancel_reason" name="cancel_reason" className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="u otro motivo…" required />
    </div>
  );
}
