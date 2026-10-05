import type { SupabaseClient } from "@supabase/supabase-js";
import { todayAR } from "./rules";
import { storeSalesForMonth, type StoreSales } from "./tiendanube";
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

/** Objetivos del mes y cuánto se vendió (Compró) contra cada uno. */
export async function getGoalSummary(supabase: SupabaseClient, team: TeamMember[], month: string) {
  const [{ data: goals }, { data: salesData }, { data: tiendaData }, store] = await Promise.all([
    supabase.from("monthly_goals").select("scope, amount").eq("month", month).returns<{ scope: string; amount: number }[]>(),
    supabase.rpc("month_sales", { p_month: month }),
    supabase.rpc("month_sales_tienda", { p_month: month }),
    storeSalesForMonth(month),
  ]);
  const sales = (salesData ?? []) as { member: string; total: number; ventas: number }[];
  const crmTienda = ((tiendaData ?? []) as { total: number; ventas: number }[])[0];
  const goalOf = new Map((goals ?? []).map((g) => [g.scope, Number(g.amount)]));
  const saleOf = new Map(sales.map((s) => [s.member, s]));

  // Vendedores: los activos, más cualquiera que tenga objetivo o ventas este mes.
  const members: GoalLine[] = team
    .filter((m) => m.active || goalOf.has(m.email) || saleOf.has(m.email))
    .map((m) => ({
      scope: m.email,
      name: m.name,
      goal: goalOf.get(m.email) ?? null,
      total: Number(saleOf.get(m.email)?.total ?? 0),
      ventas: Number(saleOf.get(m.email)?.ventas ?? 0),
    }));

  const sellersGoal = members.reduce((s, m) => s + (m.goal ?? 0), 0);
  const crm = {
    total: sales.reduce((s, x) => s + Number(x.total), 0),
    ventas: sales.reduce((s, x) => s + Number(x.ventas), 0),
  };
  // Con la tienda conectada: CRM sin el canal "Tienda online" (esas ya vienen de Tiendanube) + Tiendanube.
  const withStore = store?.ok
    ? {
        total: crm.total - Number(crmTienda?.total ?? 0) + store.total,
        ventas: crm.ventas - Number(crmTienda?.ventas ?? 0) + store.ventas,
      }
    : crm;
  const teamLine: GoalLine = {
    scope: TEAM_SCOPE,
    name: "Equipo",
    // Si no cargaron el del equipo, es la suma de los vendedores.
    goal: goalOf.get(TEAM_SCOPE) ?? (sellersGoal || null),
    total: withStore.total,
    ventas: withStore.ventas,
  };
  return { month, team: teamLine, members, explicitTeamGoal: goalOf.get(TEAM_SCOPE) ?? null, store, crm };
}

export function percent(line: GoalLine): number {
  return line.goal ? Math.round((line.total / line.goal) * 100) : 0;
}
