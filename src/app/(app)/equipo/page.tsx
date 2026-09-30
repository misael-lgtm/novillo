import { redirect } from "next/navigation";
import { getTeam, requireMember } from "@/lib/session";
import { AddMemberForm, MemberToggle } from "@/components/Team";

export default async function TeamPage() {
  const { me } = await requireMember();
  if (!me.is_admin) redirect("/");
  const team = await getTeam();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Equipo</h1>
        <p className="text-sm text-stone-500">
          Solo entran al CRM las personas de esta lista, con su mail. Si alguien se va, desactivalo (no se borra, así queda su historial).
        </p>
      </div>
      <ul className="card divide-y divide-stone-100">
        {team.map((m) => (
          <li key={m.email} className={`flex items-center justify-between gap-3 px-4 py-3 ${m.active ? "" : "opacity-50"}`}>
            <div>
              <p className="font-semibold">
                {m.name} {m.is_admin && <span className="ml-1 rounded bg-stone-900 px-1.5 py-0.5 text-xs text-white">admin</span>}
              </p>
              <p className="text-sm text-stone-500">{m.email}</p>
            </div>
            {m.email !== me.email && <MemberToggle email={m.email} active={m.active} />}
          </li>
        ))}
      </ul>
      <AddMemberForm />
    </div>
  );
}
