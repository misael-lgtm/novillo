"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMember, saveGoals, setMemberActive, setMemberAvatar } from "@/app/actions";
import { formatMoney } from "@/lib/rules";
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

export function AddMemberForm({ sharedLogins }: { sharedLogins: string[] }) {
  const { state, onSubmit, pending } = useFormAction(addMember);
  const [shared, setShared] = useState(sharedLogins.length > 0);
  const err = (f: string) => fieldError(state, f);
  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <h2 className="text-lg font-bold">Sumar a alguien</h2>
      <Field label="Nombre" name="name" error={err("name")} required>
        <input id="name" name="name" className="input" aria-invalid={!!err("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {[
          [true, "Entra con la casilla compartida"],
          [false, "Entra con su propio mail"],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => setShared(v as boolean)}
            className={`rounded-lg border px-3 py-2.5 text-sm ${shared === v ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}
          >
            {label as string}
          </button>
        ))}
      </div>
      {shared ? (
        <Field label="Casilla compartida" name="login_email" error={err("login_email")} hint="Todos los que usan esta casilla eligen su nombre al entrar" required>
          <input type="hidden" name="shared" value="on" />
          <input id="login_email" name="login_email" type="email" list="shared-logins" defaultValue={sharedLogins[0] ?? "ventas@wayfarerarg.com"} className="input" autoCapitalize="none" aria-invalid={!!err("login_email")} />
          <datalist id="shared-logins">{sharedLogins.map((l) => <option key={l} value={l} />)}</datalist>
        </Field>
      ) : (
        <Field label="Mail" name="email" error={err("email")} hint="El mail con el que va a entrar (le llega un link ahí)" required>
          <input id="email" name="email" type="email" className="input" autoCapitalize="none" aria-invalid={!!err("email")} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_admin" className="h-4 w-4" /> Es admin (puede sumar y sacar gente)
      </label>
      <ResultBanner state={state} />
      <SubmitButton pending={pending}>Sumar</SubmitButton>
    </form>
  );
}

export function GoalsForm({
  month,
  teamGoal,
  members,
}: {
  /** "YYYY-MM" */
  month: string;
  teamGoal: number | null;
  members: { email: string; name: string; goal: number | null; total: number }[];
}) {
  const { state, onSubmit, pending } = useFormAction(saveGoals);
  const router = useRouter();
  const err = (f: string) => fieldError(state, f);
  const fmt = (n: number | null) => (n ? n.toLocaleString("es-AR") : "");
  const sellersSum = members.reduce((s, m) => s + (m.goal ?? 0), 0);
  return (
    // key: al cambiar de mes, el formulario se rearma con los valores de ese mes
    <form key={month} id="objetivos" onSubmit={onSubmit} data-reset="false" className="card scroll-mt-20 space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">🎯 Objetivos del mes</h2>
        <p className="text-sm text-stone-500">
          En pesos. Cuenta lo que pasa a <b>Compró</b> en ese mes, según el vendedor de la tarjeta. Dejá vacío lo que no quieras medir.
        </p>
      </div>
      <Field label="Mes" name="month" error={err("month")}>
        <input
          id="month"
          name="month"
          type="month"
          defaultValue={month}
          className="input w-auto"
          onChange={(e) => e.target.value && router.push(`/equipo?mes=${e.target.value}#objetivos`)}
        />
      </Field>
      <Field
        label="Objetivo del equipo"
        name="goal:equipo"
        error={err("goal:equipo")}
        hint={sellersSum ? `Si lo dejás vacío, se usa la suma de los vendedores (${formatMoney(sellersSum)})` : undefined}
      >
        <input id="goal:equipo" name="goal:equipo" defaultValue={fmt(teamGoal)} inputMode="decimal" placeholder="$ 5.000.000" className="input" />
      </Field>
      <div className="space-y-3">
        <p className="text-sm font-semibold">Por vendedor</p>
        {members.map((m) => (
          <div key={m.email} className="grid grid-cols-[8rem_1fr] items-center gap-3">
            <label htmlFor={`goal:${m.email}`} className="text-sm">
              {m.name}
              {m.total > 0 && <span className="block text-xs text-stone-500">lleva {formatMoney(m.total)}</span>}
            </label>
            <div>
              <input
                id={`goal:${m.email}`}
                name={`goal:${m.email}`}
                defaultValue={fmt(m.goal)}
                inputMode="decimal"
                placeholder="$ 1.000.000"
                className="input"
                aria-invalid={!!err(`goal:${m.email}`)}
              />
              {err(`goal:${m.email}`) && <p className="mt-1 text-xs font-medium text-rose-700">{err(`goal:${m.email}`)}</p>}
            </div>
          </div>
        ))}
      </div>
      <ResultBanner state={state} />
      <SubmitButton pending={pending} className="btn-primary w-full">
        Guardar objetivos
      </SubmitButton>
    </form>
  );
}

/** "Fotito" de cada persona: un emoji que se ve al lado de su nombre en los objetivos. */
export function AvatarInput({ email, avatar }: { email: string; avatar: string | null }) {
  const [value, setValue] = useState(avatar ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function save() {
    if (value === (avatar ?? "")) return;
    start(async () => {
      const r = await setMemberAvatar(email, value);
      setError(r.ok ? null : r.error);
    });
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        aria-label="Fotito (emoji)"
        title="Fotito: pegá un emoji (ej. 👶 🐺 🥸). Se ve al lado del nombre en los objetivos."
        placeholder="🙂"
        className={`w-12 rounded-lg border border-stone-300 bg-white px-1 py-1 text-center text-xl ${pending ? "opacity-50" : ""}`}
      />
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </span>
  );
}
