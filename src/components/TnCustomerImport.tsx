"use client";

import { useState } from "react";
import { importTiendanubeCustomers, type TnImportStats } from "@/app/actions";

const ZERO: TnImportStats = { read: 0, created: 0, linked: 0, already: 0, skipped: 0, errors: 0 };

/** Botón para traer todos los clientes de Tiendanube al CRM, de a 200, mostrando el avance. */
export function TnCustomerImport() {
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState<TnImportStats>(ZERO);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm("¿Traer todos los clientes de Tiendanube al CRM? No se duplican: los que ya están se unen.")) return;
    setRunning(true);
    setError(null);
    setDone(false);
    let total = { ...ZERO };
    for (let p = 1; p <= 1000; p++) {
      setPage(p);
      const r = await importTiendanubeCustomers(p);
      if (!r.ok) {
        setError(`${r.error} (página ${p}). Podés volver a apretar: sigue sin duplicar.`);
        break;
      }
      const s = r.data!.stats;
      total = {
        read: total.read + s.read,
        created: total.created + s.created,
        linked: total.linked + s.linked,
        already: total.already + s.already,
        skipped: total.skipped + s.skipped,
        errors: total.errors + s.errors,
      };
      setStats(total);
      if (r.data!.done) {
        setDone(true);
        break;
      }
    }
    setRunning(false);
  }

  const n = (x: number) => x.toLocaleString("es-AR");
  return (
    <div className="card space-y-3 p-5">
      <div>
        <h2 className="font-bold">👥 Clientes de la tienda</h2>
        <p className="text-sm text-stone-500">
          Trae todos los clientes de Tiendanube a <b>Clientes</b>. Si alguien ya estaba en el CRM (mismo celular o mail) se une, no se duplica. Se puede repetir
          cuando quieras para sumar los nuevos.
        </p>
      </div>
      <button onClick={run} disabled={running} className="btn-primary">
        {running ? `Importando… (página ${page})` : "Importar clientes de Tiendanube"}
      </button>
      {(running || done || stats.read > 0) && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <li>Leídos: <b>{n(stats.read)}</b></li>
          <li>Nuevos: <b className="text-emerald-700">{n(stats.created)}</b></li>
          <li>Unidos a uno existente: <b>{n(stats.linked)}</b></li>
          <li>Ya estaban: <b>{n(stats.already)}</b></li>
          <li title="Sin mail ni celular válido">Salteados: <b>{n(stats.skipped)}</b></li>
          {stats.errors > 0 && <li>Con error: <b className="text-rose-700">{n(stats.errors)}</b></li>}
        </ul>
      )}
      {done && <p className="text-sm font-semibold text-emerald-800">✔ Listo, ya están en Clientes.</p>}
      {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}
