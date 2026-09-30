"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createTask, postponeTask, setTaskDone } from "@/app/actions";
import { addDays, formatDayShort } from "@/lib/rules";
import type { TaskWithOrder, TeamMember } from "@/lib/types";
import { Field, ResultBanner, SubmitButton, fieldError, useFormAction } from "./ui";

function whenLabel(due: string, today: string) {
  if (due < today) {
    const days = Math.round((Date.parse(today) - Date.parse(due)) / 86400000);
    return days === 1 ? "Venció ayer" : `Venció hace ${days} días`;
  }
  if (due === today) return "Hoy";
  if (due === addDays(today, 1)) return "Mañana";
  return formatDayShort(due);
}

export function TaskList({
  tasks,
  today,
  team,
  showAssignee = false,
  emptyText = "Nada pendiente 🎉",
}: {
  tasks: TaskWithOrder[];
  today: string;
  team?: TeamMember[];
  showAssignee?: boolean;
  emptyText?: string;
}) {
  const overdue = tasks.filter((t) => t.due_date < today);
  const todays = tasks.filter((t) => t.due_date === today);
  const later = tasks.filter((t) => t.due_date > today);

  if (!tasks.length) return <p className="card p-6 text-center text-stone-500">{emptyText}</p>;

  return (
    <div className="space-y-5">
      {[
        { title: "⚠️ Atrasadas", items: overdue, tone: "text-rose-700" },
        { title: "Para hoy", items: todays, tone: "text-stone-900" },
        { title: "Próximas", items: later, tone: "text-stone-500" },
      ]
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.title}>
            <h3 className={`mb-2 text-sm font-bold uppercase tracking-wide ${g.tone}`}>
              {g.title} <span className="font-normal">({g.items.length})</span>
            </h3>
            <ul className="card divide-y divide-stone-100">
              {g.items.map((t) => (
                <TaskRow key={t.id} task={t} today={today} team={team} showAssignee={showAssignee} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function TaskRow({
  task,
  today,
  team,
  showAssignee,
}: {
  task: TaskWithOrder;
  today: string;
  team?: TeamMember[];
  showAssignee: boolean;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const overdue = task.due_date < today;

  return (
    <li className={`flex items-center gap-3 px-4 py-3 transition ${done ? "opacity-40" : ""}`}>
      <button
        aria-label="Marcar como hecha"
        disabled={pending}
        onClick={() => {
          setDone(true);
          start(async () => {
            const r = await setTaskDone(task.id, true);
            if (!r.ok) setDone(false);
          });
        }}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
          done ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 hover:border-emerald-600"
        }`}
      >
        {done && "✓"}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${done ? "line-through" : ""}`}>{task.title}</p>
        <p className="text-xs text-stone-500">
          <span className={overdue ? "font-semibold text-rose-600" : ""}>{whenLabel(task.due_date, today)}</span>
          {task.order && (
            <>
              {" · "}
              <Link href={`/pedidos/${task.order.id}`} className="underline hover:text-stone-900">
                #{task.order.number} {task.order.customer?.name}
              </Link>
            </>
          )}
          {showAssignee && team && <> · {team.find((m) => m.email === task.assigned_to)?.name ?? task.assigned_to}</>}
        </p>
      </div>
      {!done && task.due_date <= today && (
        <button
          disabled={pending}
          onClick={() => start(async () => void (await postponeTask(task.id, 1)))}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
          title="Pasar a mañana"
        >
          Mañana →
        </button>
      )}
    </li>
  );
}

export function NewTaskForm({
  team,
  me,
  today,
  orderId,
}: {
  team: TeamMember[];
  me: string;
  today: string;
  orderId?: string;
}) {
  const { state, onSubmit, pending } = useFormAction(createTask);
  const [due, setDue] = useState(today);

  useEffect(() => {
    if (state?.ok) setDue(today);
  }, [state, today]);

  const quick = [
    { label: "Hoy", value: today },
    { label: "Mañana", value: addDays(today, 1) },
    { label: "En 3 días", value: addDays(today, 3) },
    { label: "En una semana", value: addDays(today, 7) },
  ];

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      {orderId && <input type="hidden" name="order_id" value={orderId} />}
      <Field label="Nueva tarea" name="title" error={fieldError(state, "title")} required>
        <input id="title" name="title" className="input" placeholder="Ej: Mandarle foto del buzo en verde" aria-invalid={!!fieldError(state, "title")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setDue(q.value)}
            className={`rounded-full border px-3 py-1 text-sm ${due === q.value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}
          >
            {q.label}
          </button>
        ))}
        <input type="date" name="due_date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className="rounded-full border border-stone-300 px-3 py-1 text-sm" />
      </div>
      {fieldError(state, "due_date") && <p className="text-sm text-rose-600">{fieldError(state, "due_date")}</p>}
      <div className="flex gap-2">
        <select name="assigned_to" defaultValue={me} className="input flex-1" aria-label="Para quién">
          {team.filter((m) => m.active).map((m) => (
            <option key={m.email} value={m.email}>
              {m.email === me ? `Yo (${m.name})` : m.name}
            </option>
          ))}
        </select>
        <SubmitButton pending={pending}>Agregar</SubmitButton>
      </div>
      <ResultBanner state={state} />
    </form>
  );
}
