"use client";

import { addNote } from "@/app/actions";
import { bankPromoLabel, carrierLabel, channelLabel, paymentLabel, stageLabel } from "@/lib/config";
import { formatDateTime, formatMoney } from "@/lib/rules";
import type { Activity, TeamMember } from "@/lib/types";
import { ResultBanner, SubmitButton, useFormAction } from "./ui";

const FIELD_NAMES: Record<string, string> = {
  description: "lo que pidió",
  total: "el monto",
  payment_method: "el medio de pago",
  bank_promo: "la promo bancaria",
  shipping_address: "la dirección",
  carrier: "el correo",
  tracking_code: "el seguimiento",
  cancel_reason: "el motivo de cancelación",
  assigned_to: "el responsable",
  channel: "el canal",
  due_date: "la fecha",
  title: "el título",
  name: "el nombre",
  instagram: "el Instagram",
  phone: "el celular",
  email: "el email",
  city: "la ciudad",
  notes: "las notas",
};

function fmt(field: string, v: unknown, team: TeamMember[]): string {
  if (v == null || v === "") return "vacío";
  if (field === "stage") return stageLabel(String(v));
  if (field === "total") return formatMoney(Number(v));
  if (field === "payment_method") return paymentLabel(String(v));
  if (field === "bank_promo") return bankPromoLabel(String(v));
  if (field === "carrier") return carrierLabel(String(v));
  if (field === "channel") return channelLabel(String(v));
  if (field === "assigned_to") return team.find((m) => m.email === v)?.name ?? String(v);
  return String(v);
}

function describe(a: Activity, team: TeamMember[]): React.ReactNode {
  const changes = (a.changes ?? {}) as Record<string, { de: unknown; a: unknown }>;
  switch (a.kind) {
    case "note":
      return <span className="whitespace-pre-wrap">{a.message}</span>;
    case "created":
      return a.entity === "task" ? <>creó la tarea “{a.message}”</> : a.entity === "order" ? "creó el pedido" : "creó el cliente";
    case "stage":
      return (
        <>
          pasó de <b>{fmt("stage", changes.stage?.de, team)}</b> a <b>{fmt("stage", changes.stage?.a, team)}</b>
        </>
      );
    case "done":
      return <>completó “{a.message}”</>;
    case "reopened":
      return <>reabrió “{a.message}”</>;
    case "archived":
      return a.entity === "task" ? <>descartó “{a.message}”</> : "archivó";
    case "restored":
      return "restauró";
    case "updated": {
      const parts = Object.entries(changes)
        .filter(([k]) => FIELD_NAMES[k])
        .map(([k, v]) => (
          <li key={k}>
            {FIELD_NAMES[k]}: <span className="text-stone-400 line-through">{fmt(k, v.de, team)}</span> → {fmt(k, v.a, team)}
          </li>
        ));
      if (!parts.length) return a.entity === "task" ? <>actualizó “{a.message}”</> : "hizo cambios";
      return (
        <>
          {a.entity === "task" ? <>cambió la tarea “{a.message}”:</> : "cambió:"}
          <ul className="ml-4 list-disc">{parts}</ul>
        </>
      );
    }
  }
}

export function Timeline({ items, team }: { items: Activity[]; team: TeamMember[] }) {
  if (!items.length) return null;
  return (
    <ol className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className={`rounded-lg p-3 text-sm ${a.kind === "note" ? "border border-amber-200 bg-amber-50" : "bg-white"}`}>
          <p className="mb-1 text-xs text-stone-500">
            <b className="text-stone-700">{a.actor === "sistema" ? "Sistema" : team.find((m) => m.email === a.actor)?.name ?? a.actor}</b>
            {" · "}
            {formatDateTime(a.created_at)}
          </p>
          <div>{describe(a, team)}</div>
        </li>
      ))}
    </ol>
  );
}

export function NoteForm({ orderId }: { orderId: string }) {
  const { state, onSubmit, pending } = useFormAction(addNote.bind(null, orderId));
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea name="message" rows={2} className="input" placeholder="Agregar una nota (ej: pidió que le cambien el talle)" required />
      <SubmitButton pending={pending} className="btn-secondary w-full">
        Guardar nota
      </SubmitButton>
      {state && !state.ok && <ResultBanner state={state} />}
    </form>
  );
}
