import { FINAL_STAGES } from "@/lib/config";
import { FINAL_PAGE, ORDER_SELECT } from "@/lib/queries";
import { getTeam, requireMember } from "@/lib/session";
import type { OrderWithCustomer } from "@/lib/types";
import { Board } from "@/components/Board";

export default async function BoardPage() {
  const { supabase, me } = await requireMember();
  const team = await getTeam();

  const open = supabase
    .from("orders")
    .select(ORDER_SELECT)
    .is("archived_at", null)
    .not("stage", "in", `(${FINAL_STAGES.join(",")})`)
    .order("stage_changed_at", { ascending: true })
    .limit(500)
    .returns<OrderWithCustomer[]>();
  // Compró / Sin causa tienen miles (todo el historial de ClickUp): se traen de a FINAL_PAGE,
  // los más recientes primero, y la columna tiene "Ver más".
  const finals = FINAL_STAGES.map((stage) =>
    supabase
      .from("orders")
      .select(ORDER_SELECT, { count: "exact" })
      .is("archived_at", null)
      .eq("stage", stage)
      .order("stage_changed_at", { ascending: false })
      .range(0, FINAL_PAGE - 1)
      .returns<OrderWithCustomer[]>(),
  );
  const [openRes, ...finalRes] = await Promise.all([open, ...finals]);

  const orders = [...(openRes.data ?? []), ...finalRes.flatMap((r) => r.data ?? [])];
  const remaining = Object.fromEntries(
    FINAL_STAGES.map((stage, i) => [stage, Math.max(0, (finalRes[i].count ?? 0) - (finalRes[i].data?.length ?? 0))]),
  );

  return <Board initialOrders={orders} initialRemaining={remaining} team={team} me={me.email} />;
}
