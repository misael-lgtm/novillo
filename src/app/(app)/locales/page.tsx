import { getStoreSales, monthLabel, monthStart, pace, type GoalLine, type PaceStatus } from "@/lib/goals";
import { summarizeLocals, type LocalGoal, type LocalLine } from "@/lib/locales";
import { formatMoney, todayAR } from "@/lib/rules";
import { getTeam, requireMember } from "@/lib/session";
import { LocalGoalEditor } from "@/components/LocalGoalEditor";

export const metadata = { title: "Locales" };

const COLOR: Record<PaceStatus, { bar: string; text: string; dot: string }> = {
  ok: { bar: "bg-emerald-500", text: "text-emerald-700", dot: "🟢" },
  warn: { bar: "bg-amber-400", text: "text-amber-700", dot: "🟡" },
  bad: { bar: "bg-rose-500", text: "text-rose-700", dot: "🔴" },
};

/** Ritmo de algo que se acumula en el mes (facturación o cantidad): verde/amarillo/rojo según lo que hace falta por día. */
function rhythm(total: number, goal: number | null, today: string) {
  return goal ? pace({ scope: "", name: "", goal, total, ventas: 0 } as GoalLine, today) : null;
}
/** El ticket no se acumula: verde si llega, amarillo hasta 10% abajo, rojo más abajo. */
function ticketStatus(avg: number, goal: number | null): PaceStatus | null {
  if (!goal || !avg) return null;
  return avg >= goal ? "ok" : avg >= goal * 0.9 ? "warn" : "bad";
}

function Bar({ value, goal, status }: { value: number; goal: number | null; status: PaceStatus | null }) {
  const p = goal ? Math.round((value / goal) * 100) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${status ? COLOR[status].bar : "bg-stone-400"}`} style={{ width: `${Math.min(100, p)}%` }} />
    </div>
  );
}

/** "Deberían llevar X a hoy" y la diferencia, en verde si van arriba y en rojo si van abajo. */
function Behind({ text, diff, fmt }: { text: string; diff: number; fmt: (n: number) => string }) {
  return (
    <p className="text-xs text-stone-600">
      {text} ·{" "}
      {diff === 0 ? (
        <b className="text-emerald-700">al día ✓</b>
      ) : (
        <b className={diff > 0 ? "text-emerald-700" : "text-rose-700"}>
          {diff > 0 ? "+" : "−"}
          {fmt(Math.abs(diff))}
        </b>
      )}
    </p>
  );
}

function Metric({
  label,
  value,
  goal,
  status,
  hint,
  extra,
}: {
  label: string;
  value: string;
  goal: string | null;
  status: PaceStatus | null;
  hint?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      <p className={`text-xs ${status ? COLOR[status].text : "text-stone-500"}`}>
        {goal ? (
          <>
            {status ? `${COLOR[status].dot} ` : ""}objetivo {goal}
            {hint ? ` · ${hint}` : ""}
          </>
        ) : (
          "sin objetivo"
        )}
      </p>
      {extra}
    </div>
  );
}

function pct(v: number, g: number | null) {
  return g ? `${Math.round((v / g) * 100)}%` : undefined;
}

function LineMetrics({ l, today, big = false }: { l: LocalLine; today: string; big?: boolean }) {
  const totalPace = rhythm(l.total, l.goalTotal, today);
  const countPace = rhythm(l.ventas, l.goalCount, today);
  const tk = ticketStatus(l.avg, l.goalTicket);
  return (
    <div className={`grid gap-4 ${big ? "sm:grid-cols-3" : "grid-cols-3"}`}>
      <div className="space-y-1.5">
        <Metric
          label="Facturación"
          value={formatMoney(Math.round(l.total))}
          goal={l.goalTotal ? formatMoney(Math.round(l.goalTotal)) : null}
          status={totalPace?.status ?? null}
          hint={pct(l.total, l.goalTotal)}
          extra={
            totalPace && (
              <Behind
                text={`a hoy ${big ? "deberían" : "debería"} llevar ${formatMoney(Math.round(totalPace.expected))}`}
                diff={Math.round(l.total - totalPace.expected)}
                fmt={(n) => formatMoney(n)}
              />
            )
          }
        />
        <Bar value={l.total} goal={l.goalTotal} status={totalPace?.status ?? null} />
      </div>
      <div className="space-y-1.5">
        <Metric
          label="Ventas"
          value={String(l.ventas)}
          goal={l.goalCount ? String(l.goalCount) : null}
          status={countPace?.status ?? null}
          hint={pct(l.ventas, l.goalCount)}
          extra={
            countPace && (
              <Behind
                text={`a hoy ${big ? "deberían" : "debería"} llevar ${Math.round(countPace.expected)}`}
                diff={Math.round(l.ventas - countPace.expected)}
                fmt={(n) => `${n} ${n === 1 ? "venta" : "ventas"}`}
              />
            )
          }
        />
        <Bar value={l.ventas} goal={l.goalCount} status={countPace?.status ?? null} />
      </div>
      <div className="space-y-1.5">
        <Metric
          label="Ticket promedio"
          value={l.ventas ? formatMoney(Math.round(l.avg)) : "—"}
          goal={l.goalTicket ? formatMoney(Math.round(l.goalTicket)) : null}
          status={tk}
          hint={pct(l.avg, l.goalTicket)}
          extra={
            l.goalTicket && l.ventas > 0 ? (
              <Behind text="contra el objetivo" diff={Math.round(l.avg - l.goalTicket)} fmt={(n) => `${formatMoney(n)} por venta`} />
            ) : null
          }
        />
        <Bar value={l.avg} goal={l.goalTicket} status={tk} />
      </div>
    </div>
  );
}

/** Locales: objetivo de Palermo y de Güemes (facturación, cantidad de ventas y ticket promedio) y abajo cada vendedor. */
export default async function LocalesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase, me } = await requireMember();
  const { mes } = await searchParams;
  const today = todayAR();
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : monthStart(today);
  const [team, store, { data: goals }] = await Promise.all([
    getTeam(),
    getStoreSales(supabase, month),
    supabase.from("local_goals").select("local, seller, sales_count, avg_ticket").eq("month", month).returns<LocalGoal[]>(),
  ]);
  const locals = summarizeLocals(store?.ok ? (store.local ?? []) : [], team, goals ?? []);
  const isCurrent = month === monthStart(today);
  const [y, m, d] = today.split("-").map(Number);
  const daysLeft = new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">🏬 Locales</h1>
          <p className="text-sm text-stone-500">
            {monthLabel(month)} · cuentan las ventas de Tiendanube con <b>“local/Nombre/Palermo”</b> o <b>“local/Nombre/Güemes”</b> en la nota
            {isCurrent ? ` · ${daysLeft === 1 ? "último día" : `faltan ${daysLeft} días`}` : ""}.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="month" name="mes" defaultValue={month.slice(0, 7)} className="input w-auto py-2" aria-label="Mes" />
          <button className="btn-secondary py-2">Ver</button>
        </form>
      </div>
      {!store?.ok && <p className="card p-4 text-sm">⚠️ No se pudo leer la tienda online: {store ? store.error : "no está conectada"}.</p>}

      {locals.map((l) => (
        <section key={l.id} className="card space-y-5 p-5" aria-label={`Local ${l.label}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">🏬 {l.label}</h2>
            {me.is_admin && (
              <LocalGoalEditor month={month} local={l.id} seller="" name={`el local ${l.label}`} count={l.total.goalCount} ticket={l.total.goalTicket} />
            )}
          </div>
          <LineMetrics l={l.total} today={today} big />

          <div className="border-t border-stone-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-stone-600">Vendedores</h3>
            {!l.sellers.length && <p className="text-sm text-stone-500">Todavía no hay ventas de {l.label} este mes.</p>}
            <ul className="space-y-4">
              {l.sellers.map((s) => (
                <li key={s.key} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      {s.avatar ? `${s.avatar} ` : ""}
                      {s.name}
                    </p>
                    {me.is_admin && <LocalGoalEditor month={month} local={l.id} seller={s.key} name={s.name} count={s.goalCount} ticket={s.goalTicket} />}
                  </div>
                  <LineMetrics l={s} today={today} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
