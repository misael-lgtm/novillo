"use client";

import { updateCustomer } from "@/app/actions";
import { formatPhone } from "@/lib/rules";
import type { Customer } from "@/lib/types";
import { Field, ResultBanner, SubmitButton, fieldError, useFormAction } from "./ui";

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const { state, onSubmit, pending } = useFormAction(updateCustomer.bind(null, customer.id));
  const err = (f: string) => fieldError(state, f);

  return (
    <form onSubmit={onSubmit} data-reset="false" className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Datos</h2>
        <div className="flex gap-3 text-sm">
          {customer.instagram && (
            <a href={`https://instagram.com/${customer.instagram}`} target="_blank" rel="noreferrer" className="underline">
              Instagram ↗
            </a>
          )}
          {customer.phone && (
            <a href={`https://wa.me/${customer.phone}`} target="_blank" rel="noreferrer" className="underline">
              WhatsApp ↗
            </a>
          )}
        </div>
      </div>
      <Field label="Nombre" name="name" error={err("name")} required>
        <input id="name" name="name" defaultValue={customer.name} className="input" aria-invalid={!!err("name")} />
      </Field>
      <Field label="Instagram" name="instagram" error={err("instagram")}>
        <input id="instagram" name="instagram" defaultValue={customer.instagram ? `@${customer.instagram}` : ""} className="input" autoCapitalize="none" aria-invalid={!!err("instagram")} />
      </Field>
      <Field label="Celular / WhatsApp" name="phone" error={err("phone")}>
        <input id="phone" name="phone" defaultValue={customer.phone ? formatPhone(customer.phone) : ""} className="input" inputMode="tel" aria-invalid={!!err("phone")} />
      </Field>
      <Field label="Email" name="email" error={err("email")}>
        <input id="email" name="email" type="email" defaultValue={customer.email ?? ""} className="input" aria-invalid={!!err("email")} />
      </Field>
      <Field label="Ciudad / provincia" name="city">
        <input id="city" name="city" defaultValue={customer.city ?? ""} className="input" />
      </Field>
      <Field label="Notas" name="notes" hint="Talles que usa, gustos, lo que sirva para la próxima">
        <textarea id="notes" name="notes" rows={3} defaultValue={customer.notes ?? ""} className="input" />
      </Field>
      <ResultBanner state={state} />
      <SubmitButton pending={pending}>Guardar</SubmitButton>
    </form>
  );
}
