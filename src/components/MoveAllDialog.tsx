"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveOrders } from "@/app/actions";
import { STAGES, type StageId } from "@/lib/config";
import { Modal } from "./ui";

/** "Pasar todas a…" de una columna del tablero: mueve la etapa entera (también las que no están cargadas). */
export function MoveAllDialog({
  from,
  count,
  onClose,
  onDone,
}: {
  from: StageId;
  count: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<StageId | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fromLabel = STAGES.find((s) => s.id === from)!.label;
  const n = count.toLocaleString("es-AR");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    start(async () => {
      const r = await moveOrders({ fromStage: from }, target, reason);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onDone(r.message ?? "Listo ✔");
    });
  }

  return (
    <Modal title={`Pasar todas las de "${fromLabel}"`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-stone-600">
          Vas a mover <b>{count === 1 ? "1 tarjeta" : `las ${n} tarjetas`}</b> de {fromLabel}. ¿A qué etapa?
        </p>
        <select value={target} onChange={(e) => setTarget(e.target.value as StageId | "")} className="input" aria-label="Etapa nueva" autoFocus>
          <option value="">Elegí la etapa…</option>
          {STAGES.filter((s) => s.id !== from).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {target === "sin_causa" && (
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (para los que no tienen)" className="input" required />
        )}
        {(target === "compro" || target === "esperando_pago") && (
          <p className="text-xs text-stone-500">Las que no tengan monto{target === "compro" ? " o medio de pago" : ""} se quedan donde están y te avisamos cuáles.</p>
        )}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={!target || pending}>
            {pending ? "Moviendo…" : `Mover ${count === 1 ? "1" : n}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
