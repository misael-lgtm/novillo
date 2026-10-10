// Mensaje automático a los pedidos por transferencia sin acreditar (lo llama la base cada 5 minutos con su clave).
import { createClient } from "@supabase/supabase-js";
import { AUTO_TRANSFER } from "@/lib/config";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { monthStart } from "@/lib/goals";
import { pendingTransferOrders, storeSalesForMonth } from "@/lib/tiendanube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: valid } = await db.rpc("auto_check_key", { p_key: key });
  if (!valid) return Response.json({ error: "clave inválida" }, { status: 401 });

  // De paso, guardar las ventas del mes frescas para el objetivo (el CRM las lee de la base).
  const month = monthStart();
  const sales = await storeSalesForMonth(month, { fresh: true });
  if (sales?.ok) await db.rpc("save_store_snapshot", { p_key: key, p_month: month, p_data: sales });

  const now = Date.now();
  const res = await pendingTransferOrders(now - AUTO_TRANSFER.untilMinutes * 60_000, now - AUTO_TRANSFER.afterMinutes * 60_000);
  if (!res) return Response.json({ error: "la tienda no está conectada" });
  if (!res.ok) return Response.json({ error: res.error }, { status: 502 });

  const queued: number[] = [];
  const skipped: { order: number | null; reason: string }[] = [];
  for (const o of res.orders) {
    if (!o.phone) {
      skipped.push({ order: o.number, reason: "sin celular" });
      continue;
    }
    const { data, error } = await db.rpc("auto_queue_transfer", {
      p_key: key,
      p_order_id: o.id,
      p_order_number: o.number,
      p_line: AUTO_TRANSFER.line,
      p_phone: o.phone,
      p_body: AUTO_TRANSFER.body,
    });
    if (error) skipped.push({ order: o.number, reason: error.message });
    else if (data) queued.push(o.number ?? o.id);
  }
  return Response.json({ pendientes: res.orders.length, mandados: queued, salteados: skipped }, { headers: { "cache-control": "no-store" } });
}
