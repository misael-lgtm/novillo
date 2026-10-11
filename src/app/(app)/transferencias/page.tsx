import Link from "next/link";
import { AUTO_TRANSFER } from "@/lib/config";
import { formatDateTime, formatMoney, formatPhone } from "@/lib/rules";
import { requireMember } from "@/lib/session";
import { pendingTransferOrders } from "@/lib/tiendanube";

export const metadata = { title: "Transferencias sin confirmar" };
export const dynamic = "force-dynamic";

/** Pedidos de Tiendanube por transferencia que todavía no se confirmaron (últimos 30 días). */
export default async function TransferenciasPage() {
  const { supabase } = await requireMember();
  const res = await pendingTransferOrders(Date.now() - 30 * 86400000, Date.now());

  if (!res || !res.ok) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-bold">🏦 Transferencias sin confirmar</h1>
        <p className="card p-5 text-sm">{!res ? "La tienda online no está conectada." : `⚠️ ${res.error}`}</p>
      </div>
    );
  }

  const orders = [...res.orders].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const ids = orders.map((o) => o.id);
  const { data: sent } = ids.length ? await supabase.from("wa_auto_messages").select("order_id").in("order_id", ids) : { data: [] };
  const sentIds = new Set((sent ?? []).map((s) => Number(s.order_id)));
  const sum = (list: typeof orders) => list.reduce((s, o) => s + o.total, 0);
  const off = orders.filter((o) => o.off);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🏦 Transferencias sin confirmar</h1>
        <p className="text-sm text-stone-500">Pedidos por transferencia todavía pendientes de pago en Tiendanube (últimos 30 días), del más viejo al más nuevo.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-stone-500">Total</p>
          <p className="text-xl font-black">{formatMoney(Math.round(sum(orders)))}</p>
          <p className="text-xs text-stone-500">{orders.length} pedidos</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500">Off</p>
          <p className="text-xl font-bold">{formatMoney(Math.round(sum(off)))}</p>
          <p className="text-xs text-stone-500">{off.length} pedidos</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500">Web</p>
          <p className="text-xl font-bold">{formatMoney(Math.round(sum(orders) - sum(off)))}</p>
          <p className="text-xs text-stone-500">{orders.length - off.length} pedidos</p>
        </div>
      </div>

      {!orders.length && <p className="card p-8 text-center text-sm text-stone-500">No hay transferencias pendientes 🎉</p>}

      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                #{o.number ?? o.id} · {o.name ?? "Sin nombre"}
              </p>
              <p className="text-xs text-stone-500">
                {formatDateTime(o.createdAt)} · {o.phone ? formatPhone(o.phone) : "sin celular"}
                {o.off ? ` · off/${o.off}` : " · web"}
                {sentIds.has(o.id) ? " · 🤖 ya se le escribió" : ""}
              </p>
            </div>
            <p className="font-bold">{formatMoney(o.total)}</p>
            {o.phone && (
              <Link href={`/telefonos/${AUTO_TRANSFER.line}?${new URLSearchParams({ numero: o.phone })}`} className="btn-secondary py-1.5 text-sm">
                💬 Escribirle
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
