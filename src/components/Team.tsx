"use client";

import { useTransition } from "react";
import { addMember, setMemberActive } from "@/app/actions";
import { Field, ResultBanner, SubmitButton, fieldError, useFormAction } from "./ui";

export function MemberToggle({ email, active }: { email: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => void (await setMemberActive(email, !active)))}
      className={active ? "btn-danger py-1.5" : "btn-secondary py-1.5"}
    >
      {active ? "Desactivar" : "Reactivar"}
    </button>
  );
}

export function AddMemberForm() {
  const { state, onSubmit, pending } = useFormAction(addMember);
  const err = (f: string) => fieldError(state, f);
  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <h2 className="text-lg font-bold">Sumar a alguien</h2>
      <Field label="Nombre" name="name" error={err("name")} required>
        <input id="name" name="name" className="input" aria-invalid={!!err("name")} />
      </Field>
      <Field label="Mail" name="email" error={err("email")} hint="El mail con el que va a entrar (le llega un link ahí)" required>
        <input id="email" name="email" type="email" className="input" autoCapitalize="none" aria-invalid={!!err("email")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_admin" className="h-4 w-4" /> Es admin (puede sumar y sacar gente)
      </label>
      <ResultBanner state={state} />
      <SubmitButton pending={pending}>Sumar</SubmitButton>
    </form>
  );
}
