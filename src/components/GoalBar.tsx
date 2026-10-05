import Link from "next/link";
import { getGoalSummary, monthLabel, monthStart, pace, percent, type GoalLine, type PaceStatus } from "@/lib/goals";
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
  const teamPace = pace(total, today);
  const minePace = mine ? pace(mine, today) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      {/* Todo el fondo del CRM toma el color del ritmo del equipo, suave, para tener el objetivo siempre presente. */}
      {teamPace && <div aria-hidden className={`pointer-events-none fixed inset-0 -z-10 transition-colors ${PACE[teamPace.status].page}`} />}
      <details className="card group px-4 py-3">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-bold">🎯 Objetivo de {monthLabel(month)}</span>
          <Progress line={total} status={teamPace?.status} className="min-w-40 flex-1" />
          <span className="text-sm">
            <b>{formatMoney(total.total)}</b> de {formatMoney(total.goal)} · <b>{percent(total)}%</b>
            <span className="text-stone-500">
              {" "}
              · {total.ventas} {total.ventas === 1 ? "venta" : "ventas"} · {daysLeft === 1 ? "último día" : `faltan ${daysLeft} días`}
            </span>
          </span>
          {teamPace && <PaceChip status={teamPace.status} perDay={teamPace.perDay} needPerDay={teamPace.needPerDay} />}
          {mine && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${minePace ? PACE[minePace.status].chip : "bg-stone-100"}`}>
              {minePace ? PACE[minePace.status].dot : ""} Vos: {percent(mine)}%
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
            {withGoal.map((x) => {
              const p = pace(x, today);
              return (
                <li key={x.scope} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className={`font-semibold ${x.scope === me.email ? "underline" : ""}`}>
                      {p && PACE[p.status].dot} {x.name}
                    </span>
                    <span className="text-xs text-stone-500">
                      {formatMoney(x.total)} de {formatMoney(x.goal)} · <b className="text-stone-900">{percent(x)}%</b>
                    </span>
                  </div>
                  <Progress line={x} status={p?.status} />
                  {p && (
                    <p className="text-xs text-stone-500">
                      {formatMoney(Math.round(p.perDay))}/día · necesita {formatMoney(Math.round(p.needPerDay))}/día
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </div>
  );
}

const PACE: Record<PaceStatus, { bar: string; chip: string; dot: string; label: string; page: string }> = {
  ok: { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-900", dot: "🟢", label: "Al día", page: "bg-emerald-50" },
  warn: { bar: "bg-amber-400", chip: "bg-amber-200 text-amber-900", dot: "🟡", label: "Un poco abajo", page: "bg-amber-100" },
  bad: { bar: "bg-rose-500", chip: "bg-rose-200 text-rose-900", dot: "🔴", label: "Abajo", page: "bg-rose-100" },
};

/** Cómo vienen por día contra lo necesario por día. */
function PaceChip({ status, perDay, needPerDay }: { status: PaceStatus; perDay: number; needPerDay: number }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PACE[status].chip}`}
      title={`Promedio por día: ${formatMoney(Math.round(perDay))}. Para llegar hacen falta ${formatMoney(Math.round(needPerDay))} por día.`}
    >
      {PACE[status].dot} {PACE[status].label} · {formatMoney(Math.round(perDay))}/día de {formatMoney(Math.round(needPerDay))}
    </span>
  );
}

function Progress({ line, status, className = "" }: { line: GoalLine; status?: PaceStatus; className?: string }) {
  const p = percent(line);
  // Color según el ritmo por día (verde / amarillo / rojo); sin ritmo, el de siempre.
  const color = status ? PACE[status].bar : p >= 100 ? "bg-emerald-500" : "bg-stone-900";
  return (
    <div
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${line.name}: ${p}% del objetivo${status ? `, ${PACE[status].label.toLowerCase()}` : ""}`}
      className={`h-2.5 overflow-hidden rounded-full bg-stone-200 ${className}`}
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, p)}%` }} />
    </div>
  );
}
