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
import { moveOrder, moveOrders } from "@/app/actions";
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
  // Modo selección: tildar varias tarjetas (o una columna entera) y pasarlas juntas de etapa.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<StageId | "">("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkPending, startBulk] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

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

  function toggle(ids: string[], on: boolean) {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of ids) on ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setBulkTarget("");
    setBulkReason("");
  }

  function moveSelected() {
    if (!bulkTarget || !selected.size) return;
    const label = STAGES.find((s) => s.id === bulkTarget)!.label;
    if (!confirm(`¿Pasar ${selected.size} ${selected.size === 1 ? "pedido" : "pedidos"} a "${label}"?`)) return;
    const ids = [...selected];
    const target = bulkTarget;
    const reason = bulkReason.trim();
    setError(null);
    setNotice(null);
    startBulk(async () => {
      const r = await moveOrders(ids, target, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const moved = new Set(r.data?.moved ?? []);
      setOrders((os) =>
        os.map((o) =>
          moved.has(o.id)
            ? { ...o, stage: target, stage_changed_at: new Date().toISOString(), cancel_reason: o.cancel_reason?.trim() ? o.cancel_reason : reason || o.cancel_reason }
            : o,
        ),
      );
      setNotice(r.message ?? null);
      stopSelecting();
    });
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
        <button
          onClick={() => (selecting ? stopSelecting() : (setSelecting(true), setNotice(null)))}
          className={`btn py-2 ${selecting ? "btn-primary" : "btn-secondary"}`}
        >
          {selecting ? "Listo" : "☑️ Seleccionar"}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-4 w-4" />
          Solo los míos
        </label>
      </div>
      <p className="text-xs text-stone-500">
        {selecting
          ? "Tocá las tarjetas para elegirlas, o «Elegir todas» arriba de cada columna. Después elegí a qué etapa pasarlas abajo."
          : "Arrastrá las tarjetas entre columnas (en el celu: mantené apretado). Si falta algún dato, te lo va a pedir. Para mover muchas juntas: «Seleccionar»."}
      </p>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}

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
              <Column
                key={stage.id}
                id={stage.id}
                label={stage.label}
                help={stage.help}
                color={stage.color}
                count={items.length}
                selectAll={
                  selecting && items.length
                    ? {
                        all: items.every((o) => selected.has(o.id)),
                        onToggle: (on) => toggle(items.map((o) => o.id), on),
                      }
                    : undefined
                }
              >
                {items.map((o) =>
                  selecting ? (
                    <SelectCard
                      key={o.id}
                      order={o}
                      who={teamName(o.assigned_to)}
                      checked={selected.has(o.id)}
                      onToggle={() => toggle([o.id], !selected.has(o.id))}
                    />
                  ) : (
                    <Card
                      key={o.id}
                      order={o}
                      who={teamName(o.assigned_to)}
                      nextLabel={next?.label}
                      onNext={next ? () => requestMove(o, next.id) : undefined}
                    />
                  ),
                )}
              </Column>
            );
          })}
        </div>
        {/* La tarjeta que se arrastra va por encima de todo: las columnas tienen scroll y la recortarían. */}
        <DragOverlay>
          {draggedOrder && <CardFace order={draggedOrder} who={teamName(draggedOrder.assigned_to)} className="rotate-2 shadow-lg" />}
        </DragOverlay>
      </DndContext>

      {selecting && (
        <div className="card fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 p-3 shadow-lg md:bottom-4">
          <span className="mr-auto text-sm font-semibold">
            {selected.size} {selected.size === 1 ? "elegido" : "elegidos"}
          </span>
          <select
            value={bulkTarget}
            onChange={(e) => setBulkTarget(e.target.value as StageId | "")}
            className="input w-auto py-2"
            aria-label="Pasar a"
          >
            <option value="">Pasar a…</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {bulkTarget === "sin_causa" && (
            <input
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Motivo (para los que no tienen)"
              className="input w-auto flex-1 py-2"
            />
          )}
          <button onClick={moveSelected} disabled={!bulkTarget || !selected.size || bulkPending} className="btn btn-primary py-2">
            {bulkPending ? "Moviendo…" : "Mover"}
          </button>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="btn btn-secondary py-2">
              Desmarcar
            </button>
          )}
        </div>
      )}

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
  selectAll,
  children,
}: {
  id: string;
  label: string;
  help: string;
  color: string;
  count: number;
  selectAll?: { all: boolean; onToggle: (on: boolean) => void };
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
        {selectAll && (
          <button
            onClick={() => selectAll.onToggle(!selectAll.all)}
            className="mt-2 w-full rounded-md bg-white/70 py-1.5 text-xs font-semibold hover:bg-white"
          >
            {selectAll.all ? "Desmarcar todas" : `Elegir todas (${count})`}
          </button>
        )}
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

function SelectCard({
  order,
  who,
  checked,
  onToggle,
}: {
  order: OrderWithCustomer;
  who: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className="text-left">
      <CardFace order={order} who={who} asLink={false} className={checked ? "ring-2 ring-stone-900" : ""}>
        <span className={`mt-2 flex items-center gap-2 text-xs font-semibold ${checked ? "" : "text-stone-500"}`}>
          <span
            className={`grid h-4 w-4 place-items-center rounded border ${checked ? "border-stone-900 bg-stone-900 text-white" : "border-stone-400"}`}
          >
            {checked && "✓"}
          </span>
          {checked ? "Elegido" : "Tocá para elegir"}
        </span>
      </CardFace>
    </button>
  );
}

function CardFace({
  order,
  who,
  className = "",
  asLink = true,
  children,
}: {
  order: OrderWithCustomer;
  who: string;
  className?: string;
  /** En modo selección la tarjeta no abre el pedido: tocarla la elige. */
  asLink?: boolean;
  children?: React.ReactNode;
}) {
  const stale = Date.now() - Date.parse(order.stage_changed_at) > 3 * 86400000 && !FINAL_STAGES.includes(order.stage);
  return (
    <article className={`rounded-lg border bg-white p-3 shadow-sm ${stale ? "border-amber-400" : "border-stone-200"} ${className}`}>
      <Wrap href={`/pedidos/${order.id}`} asLink={asLink}>
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
      </Wrap>
      {children}
    </article>
  );
}

function Wrap({ href, asLink, children }: { href: string; asLink: boolean; children: React.ReactNode }) {
  return asLink ? (
    <Link href={href} className="block space-y-1" draggable={false}>
      {children}
    </Link>
  ) : (
    <div className="space-y-1">{children}</div>
  );
}
