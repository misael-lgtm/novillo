// Diagnóstico de ventas del mes (diferencias con las estadísticas de Tiendanube). Solo con la clave del reloj.
import { createClient } from "@supabase/supabase-js";
import { monthStart } from "@/lib/goals";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { monthDiagnosis, pendingTransferOrders } from "@/lib/tiendanube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: valid } = await db.rpc("auto_check_key", { p_key: u.get("key") ?? "" });
  if (!valid) return Response.json({ error: "clave inválida" }, { status: 401 });
  // Liviano: solo las transferencias sin confirmar de los últimos 30 días.
  if (u.get("solo") === "transferencias") {
    const r = await pendingTransferOrders(Date.now() - 30 * 86400000, Date.now());
    if (!r?.ok) return Response.json(r ?? { error: "Tiendanube no conectado" }, { status: 502 });
    const total = r.orders.reduce((s, o) => s + o.total, 0);
    return Response.json({ cantidad: r.orders.length, total, pedidos: r.orders }, { headers: { "cache-control": "no-store" } });
  }
  const month = /^\d{4}-\d{2}$/.test(u.get("mes") ?? "") ? `${u.get("mes")}-01` : monthStart();
  return Response.json(await monthDiagnosis(month), { headers: { "cache-control": "no-store" } });
}
