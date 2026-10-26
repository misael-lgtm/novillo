// Mensajes automáticos (transferencias y carritos, cada 5 min) y ventas del mes para el objetivo (cada minuto). Lo llama la base con su clave.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTO_CART, AUTO_TRANSFER } from "@/lib/config";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { monthStart } from "@/lib/goals";
import { abandonedCarts, cartMessage, pendingTransferOrders, storeSalesForMonth } from "@/lib/tiendanube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("key") ?? "";
  // "ventas" = solo guardar las ventas del mes (cada minuto); "mensajes" = solo los mensajes automáticos (cada 5 min).
  const parte = params.get("parte");
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: valid } = await db.rpc("auto_check_key", { p_key: key });
  if (!valid) return Response.json({ error: "clave inválida" }, { status: 401 });

  // De paso, guardar las ventas del mes frescas para el objetivo (el CRM las lee de la base).
  if (parte !== "mensajes") {
    const month = monthStart();
    const sales = await storeSalesForMonth(month, { fresh: true });
    if (sales?.ok) await db.rpc("save_store_snapshot", { p_key: key, p_month: month, p_data: sales });
    // Cada minuto, además, el mensaje a los carritos nuevos (así sale apenas entra el carrito).
    if (parte === "ventas") {
      const carritos = await queueCarts(db, key);
      return Response.json({ ventas: sales?.ok ? "ok" : "sin datos", carritos }, { headers: { "cache-control": "no-store" } });
    }
  }

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
  const carritos = await queueCarts(db, key);

  return Response.json(
    { pendientes: res.orders.length, mandados: queued, salteados: skipped, carritos },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Carritos abandonados: el mismo mensaje que /carrito, desde el Teléfono Carritos (una sola vez por persona). */
async function queueCarts(db: SupabaseClient, key: string): Promise<number[] | string> {
  const now = Date.now();
  const carts = await abandonedCarts(1);
  if (!carts?.ok) return carts?.error ?? "sin tienda";
  const queued: number[] = [];
  for (const c of carts.carts) {
    const t = Date.parse(c.createdAt);
    if (!c.phone || !Number.isFinite(t) || t > now - AUTO_CART.afterMinutes * 60_000 || t < now - AUTO_CART.untilMinutes * 60_000) continue;
    const { data } = await db.rpc("auto_queue_cart", { p_key: key, p_cart_id: c.id, p_line: AUTO_CART.line, p_phone: c.phone, p_body: cartMessage() });
    if (data) queued.push(c.id);
  }
  return queued;
}
