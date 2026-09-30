import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { TeamMember } from "./types";

/** Usuario logueado + su ficha de equipo. Redirige si no corresponde. */
export const requireMember = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const { data: me } = await supabase
    .from("team_members")
    .select("email, name, is_admin, active")
    .eq("email", user.email.toLowerCase())
    .eq("active", true)
    .maybeSingle<TeamMember>();
  if (!me) redirect("/sin-acceso");

  return { supabase, me };
});

export const getTeam = cache(async () => {
  const { supabase } = await requireMember();
  const { data } = await supabase
    .from("team_members")
    .select("email, name, is_admin, active")
    .order("name")
    .returns<TeamMember[]>();
  return data ?? [];
});

export function memberName(team: TeamMember[], email: string | null) {
  if (!email) return "—";
  if (email === "sistema") return "Sistema";
  return team.find((m) => m.email === email)?.name ?? email.split("@")[0];
}
