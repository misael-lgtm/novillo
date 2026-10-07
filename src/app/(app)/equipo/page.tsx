import { redirect } from "next/navigation";
import { getTeam, requireMember } from "@/lib/session";
import Link from "next/link";
import { getGoalSummary, monthStart } from "@/lib/goals";
import { formatMoney } from "@/lib/rules";
import { AddMemberForm, AvatarInput, GoalsForm, MemberToggle } from "@/components/Team";
import { CelebrationImageForm } from "@/components/CelebrationImageForm";
import { getCelebrationImage } from "@/app/goal-actions";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase, me } = await requireMember();
  if (!me.is_admin) redirect("/");
  const team = await getTeam();
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : monthStart();
  const [goals, celebrationImage] = await Promise.all([getGoalSummary(supabase, team, month), getCelebrationImage()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Equipo</h1>
        <p className="text-sm text-stone-500">
          Solo entran al CRM las personas de esta lista. Pueden entrar con su propio mail o con una casilla compartida (ej. ventas@): en ese caso, al entrar eligen su nombre. Si alguien se va, desactivalo (no se borra, así queda su historial).
        </p>
      </div>
      <ul className="card divide-y divide-stone-100">
        {team.map((m) => (
          <li key={m.email} className={`flex items-center justify-between gap-3 px-4 py-3 ${m.active ? "" : "opacity-50"}`}>
            <div className="flex items-center gap-3">
              <AvatarInput email={m.email} avatar={m.avatar} />
              <div>
              <p className="font-semibold">
                {m.name} {m.is_admin && <span className="ml-1 rounded bg-stone-900 px-1.5 py-0.5 text-xs text-white">admin</span>}
              </p>
              <p className="text-sm text-stone-500">{m.login_email ? `Entra con ${m.login_email}` : m.email}</p>
              </div>
            </div>
            {m.email !== me.email && <MemberToggle email={m.email} active={m.active} />}
          </li>
        ))}
      </ul>
      <Link href="/tiendanube" className="card flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-stone-50">
        <span>
          🛒 Tienda online:{" "}
          {goals.store === null ? (
            <b>sin conectar</b>
          ) : goals.store.ok ? (
            <>
              <b>conectada</b> · ventas off del mes {formatMoney(goals.team.total)} ({goals.team.ventas} pedidos)
            </>
          ) : (
            <b className="text-rose-700">con error</b>
          )}
        </span>
        <span className="underline">{goals.store === null ? "Conectar" : "Ver"}</span>
      </Link>
      <GoalsForm
        month={month.slice(0, 7)}
        teamGoal={goals.explicitTeamGoal}
        members={goals.members.map((m) => ({ email: m.scope, name: m.name, goal: m.goal, total: m.total }))}
      />
      <CelebrationImageForm image={celebrationImage} />
      <AddMemberForm sharedLogins={[...new Set(team.map((m) => m.login_email).filter((l): l is string => !!l))]} />
    </div>
  );
}
