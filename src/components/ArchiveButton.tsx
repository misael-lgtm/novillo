"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCustomerArchived, setOrderArchived } from "@/app/actions";

export function ArchiveButton({ kind, id, archived }: { kind: "order" | "customer"; id: string; archived: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const noun = kind === "order" ? "pedido" : "cliente";
  const fn = kind === "order" ? setOrderArchived : setCustomerArchived;

  function run(value: boolean) {
    start(async () => {
      const r = await fn(id, value);
      if (!r.ok) return setError(r.error);
      setConfirming(false);
      router.refresh();
    });
  }

  if (archived) {
    return (
      <button disabled={pending} onClick={() => run(false)} className="btn-secondary py-1.5">
        {pending ? "Restaurando…" : "Restaurar"}
      </button>
    );
  }

  return confirming ? (
    <div className="space-y-2 rounded-lg bg-rose-50 p-3 text-sm">
      <p>
        ¿Archivar este {noun}? Deja de aparecer en el tablero y las listas, pero <b>no se borra</b>: lo encontrás en Archivo.
      </p>
      <div className="flex gap-2">
        <button onClick={() => setConfirming(false)} className="btn-secondary flex-1 py-1.5">
          No
        </button>
        <button disabled={pending} onClick={() => run(true)} className="btn-danger flex-1 py-1.5">
          {pending ? "Archivando…" : "Sí, archivar"}
        </button>
      </div>
      {error && <p className="text-rose-700">{error}</p>}
    </div>
  ) : (
    <button onClick={() => setConfirming(true)} className="text-sm text-stone-500 underline hover:text-rose-700">
      Archivar {noun}
    </button>
  );
}
