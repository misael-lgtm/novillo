"use client";

import { useEffect, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/types";

/**
 * Como useActionState, pero SIN que React borre el formulario cuando hay un
 * error de validación (así nadie pierde lo que escribió).
 */
export function useFormAction<T>(fn: (prev: unknown, fd: FormData) => Promise<ActionResult<T>>) {
  const [state, setState] = useState<ActionResult<T> | null>(null);
  const [pending, start] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await fn(null, fd);
      setState(res);
      if (res.ok && form.dataset.reset !== "false") form.reset();
    });
  }
  return { state, onSubmit, pending };
}

export function Field({
  label,
  name,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-stone-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-sm font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pending,
  className = "btn-primary",
  pendingText = "Guardando…",
}: {
  children: React.ReactNode;
  pending: boolean;
  className?: string;
  pendingText?: string;
}) {
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Mensaje de éxito / error después de una acción. */
export function ResultBanner({ state }: { state: ActionResult<unknown> | null | undefined }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    if (state?.ok) {
      const t = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (!state || !visible) return null;
  if (state.ok && !state.message) return null;
  return (
    <div
      role={state.ok ? "status" : "alert"}
      className={`rounded-lg px-4 py-3 text-sm font-medium ${
        state.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
      }`}
    >
      {state.ok ? state.message : state.error}
    </div>
  );
}

export function fieldError(state: ActionResult<unknown> | null | undefined, name: string) {
  return state && !state.ok ? state.fields?.[name] : undefined;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-2xl leading-none text-stone-400 hover:text-stone-900" aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StageBadge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}>{label}</span>;
}
