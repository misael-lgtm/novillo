"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { moveOrder } from "@/app/actions";
import { FINAL_STAGES, STAGES, channelLabel, nextStage, type StageId } from "@/lib/config";
import { formatMoney, missingForStage, type RequiredField } from "@/lib/rules";
import type { OrderWithCustomer, TeamMember } from "@/lib/types";
import { StageMoveDialog } from "./StageMoveDialog";

type Pending = { order: OrderWithCustomer; target: StageId; missing: RequiredField[] };

export function Board({ initialOrders, team, me }: { initialOrders: OrderWithCustomer[]; team: TeamMember[]; me: string }) {
  const [orders, setOrders] = useState(initialOrders);
  const [onlyMine, setOnlyMine] = useState(false);
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const dndId = useId();
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => setOrders(initialOrders), [initialOrders]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^@/, "");
    return orders.filter(
      (o) =>
        (!onlyMine || o.assigned_to === me) &&
        (!term ||
          o.customer.name.toLowerCase().includes(term) ||
          o.customer.instagram?.includes(term) ||
          String(o.number).includes(term) ||
          o.description.toLowerCase().includes(term)),
    );
  }, [orders, onlyMine, q, me]);

  function requestMove(order: OrderWithCustomer, target: StageId) {
    if (order.stage === target) return;
    setError(null);
    const missing = missingForStage(order, target);
    if (missing.length) {
      setDialog({ order, target, missing });
      return;
    }
    const prev = order.stage;
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, stage: target } : o)));
    start(async () => {
      const r = await moveOrder(order.id, target);
      if (!r.ok) {
        setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, stage: prev } : o)));
        setError(r.error);
      }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const order = orders.find((o) => o.id === e.active.id);
    const target = e.over?.id as StageId | undefined;
    if (order && target) requestMove(order, target);
  }

  const teamName = (email: string) => team.find((m) => m.email === email)?.name.split(" ")[0] ?? email.split("@")[0];

  const draggedOrder = dragging ? orders.find((o) => o.id === dragging) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Tablero</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nombre, @ig, #pedido…"
          className="input max-w-xs py-2"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-4 w-4" />
          Solo los míos
        </label>
      </div>
      <p className="text-xs text-stone-500">
        Arrastrá las tarjetas entre columnas (en el celu: mantené apretado). Si falta algún dato, te lo va a pedir.
      </p>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>}

      <DndContext
        id={dndId}
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragging(String(e.active.id))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
          {STAGES.map((stage) => {
            const items = visible.filter((o) => o.stage === stage.id);
            const next = nextStage(stage.id);
            return (
              <Column key={stage.id} id={stage.id} label={stage.label} help={stage.help} color={stage.color} count={items.length}>
                {items.map((o) => (
                  <Card
                    key={o.id}
                    order={o}
                    who={teamName(o.assigned_to)}
                    nextLabel={next?.label}
                    onNext={next ? () => requestMove(o, next.id) : undefined}
                  />
                ))}
              </Column>
            );
          })}
        </div>
        {/* La tarjeta que se arrastra va por encima de todo: las columnas tienen scroll y la recortarían. */}
        <DragOverlay>
          {draggedOrder && <CardFace order={draggedOrder} who={teamName(draggedOrder.assigned_to)} className="rotate-2 shadow-lg" />}
        </DragOverlay>
      </DndContext>

      {dialog && (
        <StageMoveDialog
          order={dialog.order}
          target={dialog.target}
          missing={dialog.missing}
          onClose={() => setDialog(null)}
          onDone={() => {
            setOrders((os) => os.map((o) => (o.id === dialog.order.id ? { ...o, stage: dialog.target } : o)));
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function Column({
  id,
  label,
  help,
  color,
  count,
  children,
}: {
  id: string;
  label: string;
  help: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      id={id}
      ref={setNodeRef}
      className={`flex max-h-[calc(100dvh-21rem)] md:max-h-[calc(100dvh-14rem)] min-h-64 w-72 shrink-0 snap-start flex-col rounded-xl border-2 p-2 transition ${color} ${isOver ? "ring-4 ring-stone-900/20" : ""}`}
    >
      <header className="px-2 pb-2 pt-1" title={help}>
        <h2 className="flex items-center justify-between font-bold">
          {label} <span className="rounded-full bg-white/70 px-2 text-sm">{count}</span>
        </h2>
        <p className="text-xs text-stone-500">{help}</p>
      </header>
      {/* Cada columna baja por su cuenta: el tablero no se estira con muchas tarjetas. */}
      <div className="-mr-1 flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">{children}</div>
    </section>
  );
}

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`;
}

function Card({
  order,
  who,
  nextLabel,
  onNext,
}: {
  order: OrderWithCustomer;
  who: string;
  nextLabel?: string;
  onNext?: () => void;
}) {
  // Mientras se arrastra, la que se mueve es la copia del DragOverlay; esta queda marcada en su lugar.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: order.id });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`touch-manipulation ${isDragging ? "opacity-40" : ""}`}>
      <CardFace order={order} who={who}>
        {onNext && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={onNext}
            className="mt-2 w-full rounded-md bg-stone-100 py-1.5 text-xs font-semibold hover:bg-stone-200"
          >
            Pasar a {nextLabel} →
          </button>
        )}
      </CardFace>
    </div>
  );
}

function CardFace({
  order,
  who,
  className = "",
  children,
}: {
  order: OrderWithCustomer;
  who: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const stale = Date.now() - Date.parse(order.stage_changed_at) > 3 * 86400000 && !FINAL_STAGES.includes(order.stage);
  return (
    <article className={`rounded-lg border bg-white p-3 shadow-sm ${stale ? "border-amber-400" : "border-stone-200"} ${className}`}>
      <Link href={`/pedidos/${order.id}`} className="block space-y-1" draggable={false}>
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span className="font-mono">
            #{order.number}
            {order.kind === "cambio" && <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 font-sans font-semibold text-violet-800">🔄 Cambio</span>}
          </span>
          <span>{channelLabel(order.channel)}</span>
        </div>
        <p className="font-semibold leading-tight">{order.customer.name}</p>
        {order.customer.instagram && <p className="text-xs text-stone-500">@{order.customer.instagram}</p>}
        <p className="line-clamp-2 text-sm text-stone-700">{order.description}</p>
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="font-semibold">{order.kind === "cambio" && order.total == null ? "Sin cargo" : formatMoney(order.total)}</span>
          <span className={stale ? "font-semibold text-amber-700" : "text-stone-500"}>
            {who} · {daysAgo(order.stage_changed_at)}
          </span>
        </div>
      </Link>
      {children}
    </article>
  );
}
