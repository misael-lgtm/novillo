import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AS_COOKIE, createClient } from "./supabase/server";
import type { TeamMember } from "./types";

const MEMBER_COLS = "email, name, is_admin, active, login_email, avatar";

/**
 * Las personas que pueden usar este login: una sola si entra con su mail,
 * varias si es una casilla compartida (ej. ventas@).
 */
export const getLoginMembers = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const login = user.email.toLowerCase();

  const { data } = await supabase
    .from("team_members")
    .select(MEMBER_COLS)
    .eq("active", true)
    .or(`login_email.eq."${login}",and(login_email.is.null,email.eq."${login}")`)
    .order("name")
    .returns<TeamMember[]>();
  const members = data ?? [];
  return { supabase, login, members, shared: members.some((m) => m.login_email) };
});

/** Persona que está usando la app. Redirige al login, a "sin acceso" o a "¿Quién sos?". */
export const requireMember = cache(async () => {
  const { supabase, members, shared } = await getLoginMembers();
  if (!members.length) redirect("/sin-acceso");

  let me: TeamMember | undefined = members[0];
  if (shared) {
    const picked = (await cookies()).get(AS_COOKIE)?.value;
    me = members.find((m) => m.email === picked);
    if (!me) redirect("/quien-soy");
  }
  return { supabase, me, shared };
});

export const getTeam = cache(async () => {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("team_members").select(MEMBER_COLS).order("name").returns<TeamMember[]>();
  return data ?? [];
});

export function memberName(team: TeamMember[], email: string | null) {
  if (!email) return "—";
  if (email === "sistema") return "Sistema";
  return team.find((m) => m.email === email)?.name ?? email.split("@")[0];
}
