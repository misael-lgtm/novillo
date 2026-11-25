// Diagnóstico de ventas del mes (diferencias con las estadísticas de Tiendanube). Solo con la clave del reloj.
import { createClient } from "@supabase/supabase-js";
import { monthStart } from "@/lib/goals";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { inventoryProbe, monthDiagnosis, pendingTransferOrders, pickupOrders, productBuyers } from "@/lib/tiendanube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: valid } = await db.rpc("auto_check_key", { p_key: u.get("key") ?? "" });
  if (!valid) return Response.json({ error: "clave inválida" }, { status: 401 });
  // Compradores de un producto: ?solo=compradores&q=pantal.*tom&desde=2025-01-01&hasta=2026-05-31&pagina=1
  // Pedidos con retiro/envío que coincide: ?solo=retiros&q=g(u|ü)emes&desde=2026-10-01&hasta=2026-10-31&pagina=1
  if (u.get("solo") === "retiros") {
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if (!date.test(u.get("desde") ?? "") || !date.test(u.get("hasta") ?? "")) return Response.json({ error: "faltan desde o hasta" }, { status: 400 });
    let match: RegExp;
    try {
      match = new RegExp((u.get("q") ?? "retiro").slice(0, 80), "i");
    } catch {
      return Response.json({ error: "q inválido" }, { status: 400 });
    }
    const r = await pickupOrders({ match, from: u.get("desde")!, to: u.get("hasta")!, page: Math.max(1, Number(u.get("pagina")) || 1), pages: Math.min(12, Math.max(1, Number(u.get("paginas")) || 3)) });
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  }
  if (u.get("solo") === "compradores") {
    const q = (u.get("q") ?? "").slice(0, 80);
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if (!q || !date.test(u.get("desde") ?? "") || !date.test(u.get("hasta") ?? "")) return Response.json({ error: "faltan q, desde o hasta" }, { status: 400 });
    let match: RegExp;
    try {
      match = new RegExp(q, "i");
    } catch {
      return Response.json({ error: "q inválido" }, { status: 400 });
    }
    const r = await productBuyers({ match, from: u.get("desde")!, to: u.get("hasta")!, page: Math.max(1, Number(u.get("pagina")) || 1), pages: Math.min(12, Math.max(1, Number(u.get("paginas")) || 3)) });
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  }
  if (u.get("solo") === "depositos") return Response.json(await inventoryProbe(), { headers: { "cache-control": "no-store" } });
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
