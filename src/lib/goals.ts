import type { SupabaseClient } from "@supabase/supabase-js";
import { todayAR } from "./rules";
import { storeSalesForMonth, type TnSale } from "./tiendanube";
import type { TeamMember } from "./types";

export const TEAM_SCOPE = "equipo";

/** "2026-10-05" → "2026-10-01" (mes en hora argentina). */
export function monthStart(isoDate = todayAR()): string {
  return isoDate.slice(0, 7) + "-01";
}

/** "2026-10-01" → "octubre 2026" */
export function monthLabel(month: string): string {
  return new Date(month + "T12:00:00Z").toLocaleDateString("es-AR", { timeZone: "UTC", month: "long", year: "numeric" });
}

export type GoalLine = { scope: string; name: string; goal: number | null; total: number; ventas: number };

type Tally = { total: number; ventas: number };

const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * A qué vendedor va cada venta off de Tiendanube: al nombre que dice "off/…" en la nota
 * ("off/Mariano" → Marian, "off/fabri" → Fabricio: se compara el principio, sin tildes).
 * Si el nombre no es de nadie del equipo, queda "sin asignar" (suma solo al equipo), nunca a otro vendedor.
 */
export async function attributeStoreSales(_supabase: SupabaseClient, team: TeamMember[], sales: TnSale[]) {
  const bySeller = new Map<string, Tally>();
  const unassigned: Tally = { total: 0, ventas: 0 };
  const sellerOf = new Map<number, string | null>();
  const firsts = team.map((m) => ({ email: m.email, first: fold(m.name.split(" ")[0]) }));
  const byOffName = (name: string | null) => {
    if (!name) return null;
    const n = fold(name);
    return firsts.find((m) => Math.min(m.first.length, n.length) >= 4 && (m.first.startsWith(n) || n.startsWith(m.first)))?.email ?? null;
  };
  for (const x of sales) {
    const seller = byOffName(x.offName);
    sellerOf.set(x.id, seller);
    const t = seller ? (bySeller.get(seller) ?? bySeller.set(seller, { total: 0, ventas: 0 }).get(seller)!) : unassigned;
    t.total += x.total;
    t.ventas += 1;
  }
  return { bySeller, unassigned, sellerOf };
}

/**
 * Objetivos del mes y cuánto se vendió contra cada uno.
 * Con Tiendanube conectada cuentan solo las ventas off (pedidos manuales de la tienda), asignadas a cada vendedor.
 * Sin Tiendanube (o si falla), cuenta lo que pasó a Compró en el CRM.
 */
export async function getGoalSummary(supabase: SupabaseClient, team: TeamMember[], month: string) {
  const [{ data: goals }, { data: salesData }, store] = await Promise.all([
    supabase.from("monthly_goals").select("scope, amount").eq("month", month).returns<{ scope: string; amount: number }[]>(),
    supabase.rpc("month_sales", { p_month: month }),
    storeSalesForMonth(month),
  ]);
  const crmSales = (salesData ?? []) as { member: string; total: number; ventas: number }[];
  const goalOf = new Map((goals ?? []).map((g) => [g.scope, Number(g.amount)]));

  const crm: Tally = {
    total: crmSales.reduce((s, x) => s + Number(x.total), 0),
    ventas: crmSales.reduce((s, x) => s + Number(x.ventas), 0),
  };
  let saleOf: Map<string, Tally>;
  let teamTally: Tally;
  let unassigned: Tally | null = null;
  if (store?.ok) {
    const a = await attributeStoreSales(supabase, team, store.off);
    saleOf = a.bySeller;
    unassigned = a.unassigned;
    teamTally = store.off.reduce((t, x) => ({ total: t.total + x.total, ventas: t.ventas + 1 }), { total: 0, ventas: 0 });
  } else {
    saleOf = new Map(crmSales.map((x) => [x.member, { total: Number(x.total), ventas: Number(x.ventas) }]));
    teamTally = crm;
  }

  // Vendedores: los activos, más cualquiera que tenga objetivo o ventas este mes.
  const members: GoalLine[] = team
    .filter((m) => m.active || goalOf.has(m.email) || saleOf.has(m.email))
    .map((m) => ({
      scope: m.email,
      name: m.name,
      goal: goalOf.get(m.email) ?? null,
      total: saleOf.get(m.email)?.total ?? 0,
      ventas: saleOf.get(m.email)?.ventas ?? 0,
    }));

  const sellersGoal = members.reduce((s, m) => s + (m.goal ?? 0), 0);
  const teamLine: GoalLine = {
    scope: TEAM_SCOPE,
    name: "Equipo",
    // Si no cargaron el del equipo, es la suma de los vendedores.
    goal: goalOf.get(TEAM_SCOPE) ?? (sellersGoal || null),
    total: teamTally.total,
    ventas: teamTally.ventas,
  };
  return { month, team: teamLine, members, explicitTeamGoal: goalOf.get(TEAM_SCOPE) ?? null, store, crm, unassigned };
}

export function percent(line: GoalLine): number {
  return line.goal ? Math.round((line.total / line.goal) * 100) : 0;
}
