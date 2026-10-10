"use client";

// Cargar el objetivo de un local o de un vendedor del local: cantidad de ventas y ticket promedio (solo admin).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveLocalGoal } from "@/app/actions";
import { formatMoney } from "@/lib/rules";

export function LocalGoalEditor({
  month,
  local,
  seller,
  name,
  count,
  ticket,
}: {
  month: string;
  local: string;
  seller: string;
  name: string;
  count: number | null;
  ticket: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [c, setC] = useState(count ? String(count) : "");
  const [t, setT] = useState(ticket ? Math.round(ticket).toLocaleString("es-AR") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = Number(c.replace(/\D/g, "")) * Number(t.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-stone-500 underline hover:text-stone-900">
        {count || ticket ? "✏️ Cambiar objetivo" : "🎯 Cargar objetivo"}
      </button>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await saveLocalGoal({ month, local, seller, salesCount: c, avgTicket: t });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setOpen(false);
        router.refresh();
      }}
      className="flex flex-wrap items-end gap-2 rounded-xl bg-stone-50 p-2 text-sm"
      aria-label={`Objetivo de ${name}`}
    >
      <label className="text-xs font-semibold text-stone-600">
        Ventas
        <input value={c} onChange={(e) => setC(e.target.value)} inputMode="numeric" placeholder="120" className="input mt-0.5 w-24 py-1.5" aria-label="Cantidad de ventas" />
      </label>
      <label className="text-xs font-semibold text-stone-600">
        Ticket promedio
        <input value={t} onChange={(e) => setT(e.target.value)} inputMode="decimal" placeholder="$ 85.000" className="input mt-0.5 w-32 py-1.5" aria-label="Ticket promedio" />
      </label>
      <button type="submit" disabled={busy} className="btn-primary py-1.5">
        {busy ? "…" : "Guardar"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn-secondary py-1.5">
        Cancelar
      </button>
      {preview > 0 && <p className="basis-full text-xs text-stone-500">Facturación objetivo: {formatMoney(Math.round(preview))}</p>}
      {error && <p className="basis-full text-xs font-medium text-rose-700">{error}</p>}
    </form>
  );
}
