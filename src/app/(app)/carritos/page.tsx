import Link from "next/link";
import { FINAL_STAGES } from "@/lib/config";
import { formatMoney, formatPhone } from "@/lib/rules";
import { requireMember } from "@/lib/session";
import { abandonedCarts, cartSummary } from "@/lib/tiendanube";
import { CartActions } from "@/components/CartActions";

export const metadata = { title: "Carritos abandonados" };

function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/** Carritos que quedaron sin pagar en Tiendanube, para escribirles desde el Teléfono Carritos o pasarlos al tablero. */
export default async function CarritosPage({ searchParams }: { searchParams: Promise<{ q?: string; dias?: string }> }) {
  const { supabase, me } = await requireMember();
  const { q = "", dias } = await searchParams;
  const days = [3, 7, 30].includes(Number(dias)) ? Number(dias) : 30;
  const res = await abandonedCarts(30);

  if (!res || !res.ok) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-bold">🛒 Carritos abandonados</h1>
        <p className="card p-5 text-sm">
          {!res ? (
            <>
              La tienda online no está conectada. Conectala en{" "}
              <Link href="/tiendanube" className="underline">
                Equipo → Tienda online
              </Link>
              .
            </>
          ) : (
            <>⚠️ {res.error}. Si dice que no dio permiso, hay que darle a la app de Tiendanube acceso a los carritos abandonados.</>
          )}
        </p>
      </div>
    );
  }

  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const from = Date.now() - days * 86400000;
  const carts = res.carts.filter(
    (c) =>
      Date.parse(c.createdAt) >= from &&
      (!term ||
        c.name?.toLowerCase().includes(term) ||
        c.email?.includes(term) ||
        (digits.length >= 3 && c.phone?.includes(digits)) ||
        cartSummary(c).toLowerCase().includes(term)),
  );

  // Quiénes ya están en el CRM, si tienen tarjeta abierta y si ya les escribieron por el Teléfono Carritos.
  const phones = [...new Set(carts.map((c) => c.phone).filter((p): p is string => !!p))];
  const emails = [...new Set(carts.map((c) => c.email).filter((e): e is string => !!e))];
  const [byPhone, byEmail, chats] = await Promise.all([
    phones.length ? supabase.from("customers").select("id, name, phone, email").in("phone", phones) : { data: [] },
    emails.length ? supabase.from("customers").select("id, name, phone, email").in("email", emails) : { data: [] },
    phones.length ? supabase.from("wa_chats").select("phone, last_at, last_message").eq("line", "carritos").in("phone", phones) : { data: [] },
  ]);
  const customers = [...(byPhone.data ?? []), ...(byEmail.data ?? [])] as { id: string; name: string; phone: string | null; email: string | null }[];
  const ids = [...new Set(customers.map((c) => c.id))];
  const { data: openOrders } = ids.length
    ? await supabase
        .from("orders")
        .select("id, number, customer_id, stage")
        .in("customer_id", ids)
        .is("archived_at", null)
        .not("stage", "in", `(${FINAL_STAGES.join(",")})`)
    : { data: [] };
  const chatOf = new Map((chats.data ?? []).map((c) => [c.phone as string, c as { last_at: string | null; last_message: string | null }]));

  const total = carts.reduce((s, c) => s + c.total, 0);
  const firstName = me.name.split(" ")[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">🛒 Carritos abandonados</h1>
          <p className="text-sm text-stone-500">
            {carts.length} {carts.length === 1 ? "carrito" : "carritos"} sin pagar · {formatMoney(total)} en juego. Se actualiza solo cada 2 minutos.
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar nombre, celu, mail o producto…" className="input w-64 py-2" aria-label="Buscar carrito" />
          <select name="dias" defaultValue={String(days)} className="input w-auto py-2" aria-label="Período">
            <option value="3">Últimos 3 días</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
          </select>
          <button className="btn-secondary py-2">Filtrar</button>
        </form>
      </div>

      {!carts.length && <p className="card p-8 text-center text-sm text-stone-500">No hay carritos abandonados en ese período 🎉</p>}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {carts.map((c) => {
          const customer = customers.find((x) => (c.phone && x.phone === c.phone) || (c.email && x.email === c.email));
          const order = customer ? (openOrders ?? []).find((o) => o.customer_id === customer.id) : undefined;
          const chat = c.phone ? chatOf.get(c.phone) : undefined;
          const first = (c.name ?? "").split(" ")[0];
          const message = `Hola${first ? ` ${first}` : ""}! Te habla ${firstName} de Wayfarer 🤙 Vimos que te quedó en el carrito ${cartSummary(c)}. ¿Te ayudo a terminar la compra?${c.url ? ` Acá lo tenés: ${c.url}` : ""}`;
          return (
            <li key={c.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.name ?? "Sin nombre"}</p>
                  <p className="truncate text-xs text-stone-500">
                    {c.phone ? formatPhone(c.phone) : "sin celular"}
                    {c.email ? ` · ${c.email}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold">{formatMoney(c.total)}</p>
                  <p className="text-xs text-stone-500">{c.createdAt ? ago(c.createdAt) : ""}</p>
                </div>
              </div>
              <ul className="space-y-1 rounded-xl bg-stone-50 p-2.5 text-sm">
                {c.products.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {p.name}
                      {p.variant && <span className="text-stone-500"> · {p.variant}</span>}
                    </span>
                    {p.qty > 1 && <span className="shrink-0 text-stone-500">x{p.qty}</span>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {customer ? (
                  <Link href={`/clientes/${customer.id}`} className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800">
                    👤 En el CRM
                  </Link>
                ) : (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">Nuevo</span>
                )}
                {order && (
                  <Link href={`/pedidos/${order.id}`} className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-800">
                    🗂️ Tarjeta #{order.number}
                  </Link>
                )}
                {chat?.last_at && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800" title={chat.last_message ?? ""}>
                    💬 {chat.last_message?.startsWith("Vos:") ? "Ya le escribieron" : "Chat"} {ago(chat.last_at)}
                  </span>
                )}
              </div>
              <CartActions cartId={c.id} phone={c.phone} url={c.url} message={message} hasCard={!!order} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
