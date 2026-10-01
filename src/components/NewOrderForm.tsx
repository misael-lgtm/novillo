"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createOrder, searchCustomers } from "@/app/actions";
import { CHANNELS } from "@/lib/config";
import { formatPhone } from "@/lib/rules";
import type { Customer, TeamMember } from "@/lib/types";
import { RadioGroup } from "./StageMoveDialog";
import { Field, ResultBanner, SubmitButton, fieldError, useFormAction } from "./ui";

export function NewOrderForm({ team, me }: { team: TeamMember[]; me: string }) {
  const { state, onSubmit, pending } = useFormAction(createOrder);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [stage, setStage] = useState<"primer_contacto" | "interesado" | "esperando_pago">("primer_contacto");
  const [formKey, setFormKey] = useState(0);
  const [lastCreated, setLastCreated] = useState<{ id: string; message?: string } | null>(null);
  const err = (f: string) => fieldError(state, f);

  useEffect(() => {
    if (state?.ok && state.data) {
      setLastCreated({ id: state.data.id, message: state.message });
      setCustomer(null);
      setIsNew(false);
      setStage("primer_contacto");
      setFormKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state]);

  return (
    <>
      {lastCreated && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <span>{lastCreated.message}</span>
          <Link href={`/pedidos/${lastCreated.id}`} className="shrink-0 underline">
            Ver pedido
          </Link>
        </div>
      )}
      <form key={formKey} onSubmit={onSubmit} className="card space-y-6 p-5">
        {/* 1. Cliente */}
        <section className="space-y-3">
          <h2 className="font-bold">1. ¿Quién es?</h2>
          {customer ? (
            <div className="flex items-center justify-between rounded-lg border-2 border-stone-900 p-3">
              <input type="hidden" name="customer_id" value={customer.id} />
              <div>
                <p className="font-semibold">{customer.name}</p>
                <p className="text-sm text-stone-500">
                  {customer.instagram && `@${customer.instagram}`} {customer.phone && `· ${formatPhone(customer.phone)}`}
                </p>
              </div>
              <button type="button" onClick={() => setCustomer(null)} className="text-sm underline">
                Cambiar
              </button>
            </div>
          ) : isNew ? (
            <div className="space-y-3 rounded-lg bg-stone-50 p-3">
              <Field label="Nombre" name="new_name" error={err("new_name")} required>
                <input id="new_name" name="new_name" className="input" autoComplete="off" aria-invalid={!!err("new_name")} />
              </Field>
              <Field label="Instagram" name="new_instagram" error={err("new_instagram")} hint="Con o sin @, o pegá el link del perfil">
                <input id="new_instagram" name="new_instagram" className="input" autoCapitalize="none" autoComplete="off" placeholder="@usuario" aria-invalid={!!err("new_instagram")} />
              </Field>
              <Field label="Celular / WhatsApp" name="new_phone" error={err("new_phone")} hint="Como lo tengas: 11 2345 6789, +54 9 11…">
                <input id="new_phone" name="new_phone" className="input" inputMode="tel" autoComplete="off" aria-invalid={!!err("new_phone")} />
              </Field>
              <p className="text-xs text-stone-500">Con Instagram o celular alcanza. Si ya existe, lo reconocemos solo.</p>
              <button type="button" onClick={() => setIsNew(false)} className="text-sm underline">
                ← Buscar cliente existente
              </button>
            </div>
          ) : (
            <CustomerSearch onPick={setCustomer} onNew={() => setIsNew(true)} error={err("new_name") || err("new_instagram")} />
          )}
        </section>

        {/* 2. Canal */}
        <section className="space-y-3">
          <h2 className="font-bold">2. ¿Por dónde escribió?</h2>
          <RadioGroup name="channel" options={CHANNELS} defaultValue="instagram" />
          {err("channel") && <p className="text-sm text-rose-600">{err("channel")}</p>}
        </section>

        {/* 3. Qué quiere */}
        <section className="space-y-3">
          <h2 className="font-bold">3. ¿Qué quiere?</h2>
          <Field label="Prendas, talles y colores" name="description" error={err("description")} required>
            <textarea id="description" name="description" rows={3} className="input" placeholder="Ej: Buzo Oversize negro talle L + remera blanca M" aria-invalid={!!err("description")} />
          </Field>
          <Field
            label="Monto total"
            name="total"
            error={err("total")}
            hint={stage === "esperando_pago" ? "Obligatorio si ya confirmó" : "Si todavía no sabés, dejalo vacío"}
            required={stage === "esperando_pago"}
          >
            <input id="total" name="total" className="input" inputMode="decimal" placeholder="$ 45.000" aria-invalid={!!err("total")} />
          </Field>
        </section>

        {/* 4. Estado */}
        <section className="space-y-3">
          <h2 className="font-bold">4. ¿En qué está?</h2>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["primer_contacto", "Recién escribe"],
                ["interesado", "Le interesa algo"],
                ["esperando_pago", "Confirmó, falta que pague"],
              ] as const
            ).map(([id, label]) => (
              <label
                key={id}
                className="flex cursor-pointer items-center rounded-lg border border-stone-300 px-3 py-2.5 text-sm has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white"
              >
                <input type="radio" name="stage" value={id} checked={stage === id} onChange={() => setStage(id)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          <Field label="¿Quién lo sigue?" name="assigned_to">
            <select id="assigned_to" name="assigned_to" defaultValue={me} className="input">
              {team.filter((m) => m.active).map((m) => (
                <option key={m.email} value={m.email}>
                  {m.email === me ? `Yo (${m.name})` : m.name}
                </option>
              ))}
            </select>
          </Field>
        </section>

        {state && !state.ok && <ResultBanner state={state} />}
        <SubmitButton pending={pending} className="btn-primary w-full py-3 text-base">
          Crear pedido
        </SubmitButton>
      </form>
    </>
  );
}

function CustomerSearch({ onPick, onNew, error }: { onPick: (c: Customer) => void; onNew: () => void; error?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[] | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(() => start(async () => setResults(await searchCustomers(q))), 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="space-y-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="input"
        placeholder="Buscá por nombre, @instagram o celular"
        autoComplete="off"
        aria-invalid={!!error}
        autoFocus
      />
      {error && <p className="text-sm text-rose-600">Elegí un cliente o cargá uno nuevo.</p>}
      {pending && <p className="text-sm text-stone-500">Buscando…</p>}
      {results && (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} className="w-full px-3 py-2.5 text-left hover:bg-stone-50">
                <span className="font-medium">{c.name}</span>{" "}
                <span className="text-sm text-stone-500">
                  {c.instagram && `@${c.instagram}`} {c.phone && `· ${formatPhone(c.phone)}`}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-2.5 text-sm text-stone-500">No encontré a nadie con “{q}”.</li>}
        </ul>
      )}
      <button type="button" onClick={onNew} className="btn-secondary w-full">
        + Es un cliente nuevo
      </button>
    </div>
  );
}
