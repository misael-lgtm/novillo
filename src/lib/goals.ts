import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneAR, todayAR } from "./rules";
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
 * A qué vendedor va cada venta off de Tiendanube:
 * 1) si la nota del pedido nombra a alguien del equipo (ej. "Marian"), a esa persona;
 * 2) si no, al vendedor de la tarjeta del cliente con ese celular o mail en el CRM;
 * 3) si no, queda "sin asignar" (suma solo al equipo).
 */
async function attributeStoreSales(supabase: SupabaseClient, team: TeamMember[], sales: TnSale[]) {
  const bySeller = new Map<string, Tally>();
  const unassigned: Tally = { total: 0, ventas: 0 };
  const add = (t: Tally, total: number) => {
    t.total += total;
    t.ventas += 1;
  };

  const names = team
    .map((m) => ({ email: m.email, re: new RegExp(`\\b${fold(m.name.split(" ")[0]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) }))
    .filter((n) => n.re.source.length > 6);
  const byNote = (note: string) => names.find((n) => n.re.test(fold(note)))?.email ?? null;

  // Clientes del CRM con esos celulares / mails, y el vendedor de su tarjeta más reciente.
  const pending = sales.filter((x) => !byNote(x.note));
  const phones = [...new Set(pending.map((x) => normalizePhoneAR(x.phone)).filter((p): p is string => !!p))];
  const emails = [...new Set(pending.map((x) => x.email).filter((e): e is string => !!e))];
  const sellerOfCustomer = new Map<string, string>();
  if (phones.length || emails.length) {
    const ors = [
      ...(phones.length ? [`phone.in.(${phones.join(",")})`] : []),
      ...(emails.length ? [`email.in.(${emails.map((e) => `"${e.replace(/"/g, "")}"`).join(",")})`] : []),
    ].join(",");
    const { data } = await supabase
      .from("customers")
      .select("phone, email, orders(assigned_to, archived_at, stage_changed_at)")
      .or(ors)
      .returns<{ phone: string | null; email: string | null; orders: { assigned_to: string; archived_at: string | null; stage_changed_at: string }[] }[]>();
    for (const c of data ?? []) {
      const card = [...c.orders].sort(
        (a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || b.stage_changed_at.localeCompare(a.stage_changed_at),
      )[0];
      if (!card) continue;
      if (c.phone) sellerOfCustomer.set(`p:${c.phone}`, card.assigned_to);
      if (c.email) sellerOfCustomer.set(`e:${c.email.toLowerCase()}`, card.assigned_to);
    }
  }

  for (const x of sales) {
    const phone = normalizePhoneAR(x.phone);
    const seller =
      byNote(x.note) ?? (phone && sellerOfCustomer.get(`p:${phone}`)) ?? (x.email && sellerOfCustomer.get(`e:${x.email}`)) ?? null;
    if (!seller) add(unassigned, x.total);
    else {
      if (!bySeller.has(seller)) bySeller.set(seller, { total: 0, ventas: 0 });
      add(bySeller.get(seller)!, x.total);
    }
  }
  return { bySeller, unassigned };
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
