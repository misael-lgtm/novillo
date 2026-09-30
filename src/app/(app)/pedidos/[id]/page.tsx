import Link from "next/link";
import { notFound } from "next/navigation";
import { STAGES, carrierLabel, channelLabel, trackingLink } from "@/lib/config";
import { ORDER_SELECT, TASK_SELECT } from "@/lib/queries";
import { formatDate, formatMoney, formatPhone, todayAR } from "@/lib/rules";
import { getTeam, memberName, requireMember } from "@/lib/session";
import type { Activity, OrderWithCustomer, TaskWithOrder } from "@/lib/types";
import { ArchiveButton } from "@/components/ArchiveButton";
import { ExchangeButton } from "@/components/ExchangeButton";
import { NoteForm, Timeline } from "@/components/Timeline";
import { OrderEditForm, StageControls } from "@/components/OrderDetail";
import { NewTaskForm, TaskList } from "@/components/Tasks";
import { StageBadge } from "@/components/ui";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, me } = await requireMember();
  const team = await getTeam();

  const [{ data: order }, { data: tasks }, { data: activity }, { data: related }] = await Promise.all([
    supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle<OrderWithCustomer>(),
    supabase.from("tasks").select(TASK_SELECT).eq("order_id", id).is("done_at", null).is("archived_at", null).order("due_date").returns<TaskWithOrder[]>(),
    supabase.from("activity_log").select("*").eq("order_id", id).order("created_at", { ascending: false }).limit(200).returns<Activity[]>(),
    // Pedido original (si es un cambio) y cambios pedidos (si es una venta)
    supabase.from("orders").select("id, number, parent_order_id, stage").or(`parent_order_id.eq.${id},id.eq.${id}`).returns<{ id: string; number: number; parent_order_id: string | null; stage: string }[]>(),
  ]);
  if (!order) notFound();

  const stage = STAGES.find((s) => s.id === order.stage)!;
  const exchanges = (related ?? []).filter((o) => o.parent_order_id === order.id);
  const { data: parent } = order.parent_order_id
    ? await supabase.from("orders").select("id, number").eq("id", order.parent_order_id).maybeSingle<{ id: string; number: number }>()
    : { data: null };
  const track = trackingLink(order.carrier, order.tracking_code);

  return (
    <div className="space-y-6">
      {order.archived_at && (
        <div className="flex items-center justify-between rounded-lg bg-stone-200 px-4 py-3 text-sm font-medium">
          Este pedido está archivado.
          <ArchiveButton kind="order" id={order.id} archived />
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {order.kind === "cambio" ? "Cambio" : "Pedido"} #{order.number}
            </h1>
            <StageBadge label={stage.label} color={stage.color} />
          </div>
          {parent && (
            <p className="text-sm font-medium text-violet-700">
              🔄 Cambio del{" "}
              <Link href={`/pedidos/${parent.id}`} className="underline">
                pedido #{parent.number}
              </Link>
              {order.total == null && " · sin cargo"}
            </p>
          )}
          {exchanges.length > 0 && (
            <p className="text-sm font-medium text-violet-700">
              🔄 Cambios:{" "}
              {exchanges.map((x, i) => (
                <span key={x.id}>
                  {i > 0 && ", "}
                  <Link href={`/pedidos/${x.id}`} className="underline">
                    #{x.number}
                  </Link>
                </span>
              ))}
            </p>
          )}
          <p className="text-stone-600">
            <Link href={`/clientes/${order.customer.id}`} className="font-semibold underline">
              {order.customer.name}
            </Link>
            {order.customer.instagram && (
              <>
                {" · "}
                <a href={`https://instagram.com/${order.customer.instagram}`} target="_blank" rel="noreferrer" className="underline">
                  @{order.customer.instagram}
                </a>
              </>
            )}
            {order.customer.phone && (
              <>
                {" · "}
                <a href={`https://wa.me/${order.customer.phone}`} target="_blank" rel="noreferrer" className="underline">
                  WhatsApp {formatPhone(order.customer.phone)}
                </a>
              </>
            )}
          </p>
          <p className="text-xs text-stone-500">
            Entró por {channelLabel(order.channel)} · creado por {memberName(team, order.created_by)} el{" "}
            {formatDate(order.created_at)} · lo sigue <b>{memberName(team, order.assigned_to)}</b>
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black">{order.kind === "cambio" && order.total == null ? "Sin cargo" : formatMoney(order.total)}</p>
          {track && (
            <a href={track} target="_blank" rel="noreferrer" className="text-sm underline">
              Seguir envío ({carrierLabel(order.carrier)}) ↗
            </a>
          )}
        </div>
      </header>

      {!order.archived_at && <StageControls order={order} />}
      {!order.archived_at && order.kind === "venta" && ["enviado", "entregado"].includes(order.stage) && (
        <ExchangeButton orderId={order.id} address={order.shipping_address} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <OrderEditForm key={order.stage} order={order} team={team} />
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Tareas de este pedido</h2>
            <TaskList tasks={tasks ?? []} today={todayAR()} team={team} showAssignee emptyText="Sin tareas pendientes." />
            {!order.archived_at && <NewTaskForm team={team} me={me.email} today={todayAR()} orderId={order.id} />}
          </section>
        </div>
        <aside className="space-y-4">
          <h2 className="text-lg font-bold">Notas e historial</h2>
          <NoteForm orderId={order.id} />
          <Timeline items={activity ?? []} team={team} />
          {!order.archived_at && (
            <div className="border-t border-stone-200 pt-4">
              <ArchiveButton kind="order" id={order.id} archived={false} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
