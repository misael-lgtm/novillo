import { ORDER_SELECT } from "@/lib/queries";
import { getTeam, requireMember } from "@/lib/session";
import type { OrderWithCustomer } from "@/lib/types";
import { Board } from "@/components/Board";

export default async function BoardPage() {
  const { supabase, me } = await requireMember();
  const team = await getTeam();
  // Entregados y cancelados: solo los últimos 14 días, para que el tablero no se llene.
  const since = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .is("archived_at", null)
    .or(`stage.not.in.(entregado,cancelado),stage_changed_at.gte."${since}"`)
    .order("stage_changed_at", { ascending: true })
    .limit(500)
    .returns<OrderWithCustomer[]>();

  return <Board initialOrders={data ?? []} team={team} me={me.email} />;
}
