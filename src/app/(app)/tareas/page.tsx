import Link from "next/link";
import { TASK_SELECT } from "@/lib/queries";
import { todayAR } from "@/lib/rules";
import { getTeam, requireMember } from "@/lib/session";
import type { TaskWithOrder } from "@/lib/types";
import { NewTaskForm, TaskList } from "@/components/Tasks";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ quien?: string }> }) {
  const { quien } = await searchParams;
  const { supabase, me } = await requireMember();
  const team = await getTeam();
  const who = quien ?? "todos";
  const today = todayAR();

  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .is("done_at", null)
    .is("archived_at", null)
    .order("due_date")
    .limit(300);
  if (who !== "todos") query = query.eq("assigned_to", who);
  const { data } = await query.returns<TaskWithOrder[]>();

  const tabs = [{ email: "todos", name: "Todo el equipo" }, ...team.filter((m) => m.active)];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tareas</h1>
      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.email}
            href={t.email === "todos" ? "/tareas" : `/tareas?quien=${encodeURIComponent(t.email)}`}
            className={`rounded-full border px-3 py-1 text-sm ${who === t.email ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 hover:bg-stone-100"}`}
          >
            {t.email === me.email ? "Yo" : t.name}
          </Link>
        ))}
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <TaskList tasks={data ?? []} today={today} team={team} showAssignee={who === "todos"} />
        <aside>
          <NewTaskForm team={team} me={me.email} today={today} />
        </aside>
      </div>
    </div>
  );
}
