import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AS_COOKIE } from "@/lib/supabase/server";
import { getLoginMembers } from "@/lib/session";

async function choose(fd: FormData) {
  "use server";
  const { members } = await getLoginMembers();
  const email = String(fd.get("email") ?? "");
  if (!members.some((m) => m.email === email)) redirect("/quien-soy");
  (await cookies()).set(AS_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}

export default async function WhoAmI() {
  const { members, login } = await getLoginMembers();
  if (!members.length) redirect("/sin-acceso");
  if (members.length === 1 && !members[0].login_email) redirect("/");
  const current = (await cookies()).get(AS_COOKIE)?.value;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-5 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight">¿Quién sos?</h1>
          <p className="text-sm text-stone-500">Entraste con {login}. Elegí tu nombre: todo lo que cargues va a quedar a tu nombre.</p>
        </div>
        <form action={choose} className="grid gap-2">
          {members.map((m) => (
            <button
              key={m.email}
              name="email"
              value={m.email}
              className={`w-full rounded-xl border px-4 py-3.5 text-left text-lg font-semibold transition hover:border-stone-900 ${
                m.email === current ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"
              }`}
            >
              {m.name}
            </button>
          ))}
        </form>
        <p className="text-center text-xs text-stone-500">Esta compu se va a acordar. Si la usa otra persona, tocá tu nombre arriba a la derecha → cambiar.</p>
      </div>
    </main>
  );
}
