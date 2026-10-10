// Locales (Palermo, Güemes): ventas del mes con "local/Nombre/Local" en la nota, contra el objetivo.
import type { TnLocalSale } from "./tiendanube";
import type { TeamMember } from "./types";

export const LOCALES = [
  { id: "palermo", label: "Palermo" },
  { id: "guemes", label: "Güemes" },
] as const;
export type LocalId = (typeof LOCALES)[number]["id"];

export type LocalGoal = { local: string; seller: string; sales_count: number | null; avg_ticket: number | null };

export type LocalLine = {
  /** '' = el local entero; si no, el mail del vendedor o "nombre:<nombre>" si no es del equipo. */
  key: string;
  name: string;
  avatar: string | null;
  total: number;
  ventas: number;
  avg: number;
  goalCount: number | null;
  goalTicket: number | null;
  /** ventas × ticket */
  goalTotal: number | null;
};

const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const commonPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** "fabrico" → Fabricio, "misa" → Misael: el del equipo cuyo nombre empieza igual (4 letras o más). */
function memberFor(team: TeamMember[], raw: string | null) {
  if (!raw) return null;
  const n = fold(raw);
  let best: { m: TeamMember; len: number } | null = null;
  for (const m of team) {
    const first = fold(m.name.split(" ")[0]);
    const len = commonPrefix(first, n);
    if (len >= 4 && len >= Math.min(first.length, n.length, 5) && (!best || len > best.len)) best = { m, len };
  }
  return best?.m ?? null;
}

const line = (key: string, name: string, avatar: string | null, sales: TnLocalSale[], goal?: LocalGoal): LocalLine => {
  const total = sales.reduce((s, x) => s + x.total, 0);
  const goalCount = goal?.sales_count ?? null;
  const goalTicket = goal?.avg_ticket != null ? Number(goal.avg_ticket) : null;
  return {
    key,
    name,
    avatar,
    total,
    ventas: sales.length,
    avg: sales.length ? total / sales.length : 0,
    goalCount,
    goalTicket,
    goalTotal: goalCount && goalTicket ? goalCount * goalTicket : null,
  };
};

/** Por local: el total y cada vendedor (con o sin objetivo cargado), del que más vendió al que menos. */
export function summarizeLocals(sales: TnLocalSale[], team: TeamMember[], goals: LocalGoal[]) {
  return LOCALES.map((l) => {
    const mine = sales.filter((s) => s.local === l.id);
    const goalOf = (seller: string) => goals.find((g) => g.local === l.id && g.seller === seller);
    const bySeller = new Map<string, { name: string; avatar: string | null; sales: TnLocalSale[] }>();
    for (const s of mine) {
      const m = memberFor(team, s.seller);
      const key = m ? m.email : `nombre:${fold(s.seller ?? "sin nombre")}`;
      const name = m ? m.name.split(" ")[0] : (s.seller ?? "Sin nombre").replace(/^./, (c) => c.toUpperCase());
      const e = bySeller.get(key) ?? { name, avatar: m?.avatar ?? null, sales: [] };
      e.sales.push(s);
      bySeller.set(key, e);
    }
    // Vendedores con objetivo cargado aunque todavía no vendieron.
    for (const g of goals.filter((g) => g.local === l.id && g.seller && !bySeller.has(g.seller))) {
      const m = team.find((t) => t.email === g.seller);
      bySeller.set(g.seller, { name: m ? m.name.split(" ")[0] : g.seller.replace(/^nombre:/, ""), avatar: m?.avatar ?? null, sales: [] });
    }
    const sellers = [...bySeller].map(([key, v]) => line(key, v.name, v.avatar, v.sales, goalOf(key))).sort((a, b) => b.total - a.total);
    return { id: l.id, label: l.label, total: line("", l.label, null, mine, goalOf("")), sellers };
  });
}
