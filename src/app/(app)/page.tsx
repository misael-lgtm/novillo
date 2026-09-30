import Link from "next/link";
import { STAGES } from "@/lib/config";
import { addDays, todayAR } from "@/lib/rules";
import { getTeam, requireMember } from "@/lib/session";
import type { TaskWithOrder } from "@/lib/types";
import { NewTaskForm, TaskList } from "@/components/Tasks";

import { TASK_SELECT } from "@/lib/queries";

export default async function TodayPage() {
  const { supabase, me } = await requireMember();
  const team = await getTeam();
  const today = todayAR();

  const [{ data: tasks }, { data: orders }] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("assigned_to", me.email)
      .is("done_at", null)
      .is("archived_at", null)
      .lte("due_date", addDays(today, 14))
      .order("due_date")
      .limit(100)
      .returns<TaskWithOrder[]>(),
    supabase.from("orders").select("stage, assigned_to").is("archived_at", null).not("stage", "in", "(entregado,cancelado)"),
  ]);

  const counts = Object.fromEntries(STAGES.map((s) => [s.id, 0]));
  const mine = Object.fromEntries(STAGES.map((s) => [s.id, 0]));
  for (const o of orders ?? []) {
    counts[o.stage]++;
    if (o.assigned_to === me.email) mine[o.stage]++;
  }
  const open = (tasks ?? []).filter((t) => t.due_date <= today).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Hola, {me.name.split(" ")[0]} 👋</h1>
        <p className="text-stone-500">
          {open === 0 ? "No tenés nada pendiente para hoy." : `Tenés ${open} ${open === 1 ? "cosa" : "cosas"} para hoy.`}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STAGES.filter((s) => s.id !== "entregado" && s.id !== "cancelado").map((s) => (
          <Link key={s.id} href={`/tablero#${s.id}`} className={`rounded-xl border p-4 transition hover:shadow ${s.color}`}>
            <p className="text-3xl font-black">{counts[s.id]}</p>
            <p className="text-sm font-medium">{s.label}</p>
            {mine[s.id] > 0 && <p className="text-xs text-stone-500">{mine[s.id]} {mine[s.id] === 1 ? "tuyo" : "tuyos"}</p>}
          </Link>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <h2 className="mb-3 text-lg font-bold">Mis tareas</h2>
          <TaskList tasks={tasks ?? []} today={today} emptyText="No tenés tareas pendientes 🎉" />
        </section>
        <aside>
          <NewTaskForm team={team} me={me.email} today={today} />
        </aside>
      </div>
    </div>
  );
}
