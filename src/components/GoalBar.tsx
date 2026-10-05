import Link from "next/link";
import { getGoalSummary, monthLabel, monthStart, percent, type GoalLine } from "@/lib/goals";
import { formatMoney, todayAR } from "@/lib/rules";
import { getTeam, requireMember } from "@/lib/session";

/** Barra de arriba: cómo venimos con el objetivo del mes (equipo, yo y cada vendedor). */
export async function GoalBar() {
  const { supabase, me } = await requireMember();
  const team = await getTeam();
  const today = todayAR();
  const month = monthStart(today);
  const { team: total, members, store, crm, unassigned } = await getGoalSummary(supabase, team, month);

  if (!total.goal) {
    if (!me.is_admin) return null;
    return (
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <Link href="/equipo#objetivos" className="block rounded-xl border border-dashed border-stone-300 px-4 py-2 text-sm text-stone-500 hover:bg-stone-100">
          🎯 Todavía no cargaste el objetivo de {monthLabel(month)}. <span className="font-semibold underline">Cargarlo</span>
        </Link>
      </div>
    );
  }

  const [y, m, d] = today.split("-").map(Number);
  // Hoy cuenta como día que falta: el 5/10 faltan 27 (del 5 al 31 inclusive).
  const daysLeft = new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
  const mine = members.find((x) => x.scope === me.email && x.goal);
  const withGoal = members.filter((x) => x.goal).sort((a, b) => percent(b) - percent(a));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <details className="card group px-4 py-3">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-bold">🎯 Objetivo de {monthLabel(month)}</span>
          <Progress line={total} className="min-w-40 flex-1" />
          <span className="text-sm">
            <b>{formatMoney(total.total)}</b> de {formatMoney(total.goal)} · <b>{percent(total)}%</b>
            <span className="text-stone-500">
              {" "}
              · {total.ventas} {total.ventas === 1 ? "venta" : "ventas"} · {daysLeft === 1 ? "último día" : `faltan ${daysLeft} días`}
            </span>
          </span>
          {mine && (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold">
              Vos: {percent(mine)}%
            </span>
          )}
          {(withGoal.length > 0 || store) && (
            <span className="text-xs text-stone-500 underline group-open:hidden">Ver detalle</span>
          )}
        </summary>
        {store && (
          <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
            {store.ok ? (
              <>
                Cuenta las <b className="text-stone-900">ventas off de Tiendanube</b>: pedidos pagados con “off/Nombre” en las notas.
                {unassigned && unassigned.ventas > 0 && (
                  <>
                    {" "}
                    Sin vendedor asignado: <b className="text-stone-900">{formatMoney(unassigned.total)}</b> ({unassigned.ventas}{" "}
                    {unassigned.ventas === 1 ? "pedido" : "pedidos"}) — el nombre después de “off/” no es de nadie del equipo. Mirá el detalle en Equipo → Tienda online.
                  </>
                )}
              </>
            ) : (
              <>⚠️ No se pudo leer la tienda online ({store.error}): por ahora solo cuenta lo cargado en el CRM ({formatMoney(crm.total)}).</>
            )}
          </p>
        )}
        {withGoal.length > 0 && (
          <ul className="mt-3 grid gap-x-6 gap-y-2 border-t border-stone-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">
            {withGoal.map((x) => (
              <li key={x.scope} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className={`font-semibold ${x.scope === me.email ? "underline" : ""}`}>{x.name}</span>
                  <span className="text-xs text-stone-500">
                    {formatMoney(x.total)} de {formatMoney(x.goal)} · <b className="text-stone-900">{percent(x)}%</b>
                  </span>
                </div>
                <Progress line={x} />
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

function Progress({ line, className = "" }: { line: GoalLine; className?: string }) {
  const p = percent(line);
  return (
    <div
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${line.name}: ${p}% del objetivo`}
      className={`h-2.5 overflow-hidden rounded-full bg-stone-200 ${className}`}
    >
      <div className={`h-full rounded-full ${p >= 100 ? "bg-emerald-500" : "bg-stone-900"}`} style={{ width: `${Math.min(100, p)}%` }} />
    </div>
  );
}
