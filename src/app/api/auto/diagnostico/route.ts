// Diagnóstico de ventas del mes (diferencias con las estadísticas de Tiendanube). Solo con la clave del reloj.
import { createClient } from "@supabase/supabase-js";
import { monthStart } from "@/lib/goals";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { monthDiagnosis } from "@/lib/tiendanube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: valid } = await db.rpc("auto_check_key", { p_key: u.get("key") ?? "" });
  if (!valid) return Response.json({ error: "clave inválida" }, { status: 401 });
  const month = /^\d{4}-\d{2}$/.test(u.get("mes") ?? "") ? `${u.get("mes")}-01` : monthStart();
  return Response.json(await monthDiagnosis(month), { headers: { "cache-control": "no-store" } });
}
