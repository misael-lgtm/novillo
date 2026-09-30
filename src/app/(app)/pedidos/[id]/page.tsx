import Link from "next/link";
import { notFound } from "next/navigation";
import { STAGES, carrierLabel, channelLabel, trackingLink } from "@/lib/config";
import { ORDER_SELECT, TASK_SELECT } from "@/lib/queries";
import { formatDate, formatMoney, formatPhone, todayAR } from "@/lib/rules";
import { getTeam, memberName, requireMember } from "@/lib/session";
import type { Activity, OrderWithCustomer, TaskWithOrder } from "@/lib/types";
import { ArchiveButton } from "@/components/ArchiveButton";
import { NoteForm, Timeline } from "@/components/Timeline";
import { OrderEditForm, StageControls } from "@/components/OrderDetail";
import { NewTaskForm, TaskList } from "@/components/Tasks";
import { StageBadge } from "@/components/ui";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, me } = await requireMember();
  const team = await getTeam();

  const [{ data: order }, { data: tasks }, { data: activity }] = await Promise.all([
    supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle<OrderWithCustomer>(),
    supabase.from("tasks").select(TASK_SELECT).eq("order_id", id).is("done_at", null).is("archived_at", null).order("due_date").returns<TaskWithOrder[]>(),
    supabase.from("activity_log").select("*").eq("order_id", id).order("created_at", { ascending: false }).limit(200).returns<Activity[]>(),
  ]);
  if (!order) notFound();

  const stage = STAGES.find((s) => s.id === order.stage)!;
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
            <h1 className="text-2xl font-bold">Pedido #{order.number}</h1>
            <StageBadge label={stage.label} color={stage.color} />
          </div>
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
          <p className="text-2xl font-black">{formatMoney(order.total)}</p>
          {track && (
            <a href={track} target="_blank" rel="noreferrer" className="text-sm underline">
              Seguir envío ({carrierLabel(order.carrier)}) ↗
            </a>
          )}
        </div>
      </header>

      {!order.archived_at && <StageControls order={order} />}

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
