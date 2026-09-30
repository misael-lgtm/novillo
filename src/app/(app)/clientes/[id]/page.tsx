import Link from "next/link";
import { notFound } from "next/navigation";
import { STAGES } from "@/lib/config";
import { formatDate, formatMoney } from "@/lib/rules";
import { requireMember } from "@/lib/session";
import type { Customer, Order } from "@/lib/types";
import { ArchiveButton } from "@/components/ArchiveButton";
import { CustomerEditForm } from "@/components/CustomerEditForm";
import { StageBadge } from "@/components/ui";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireMember();

  const [{ data: customer }, { data: orders }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle<Customer>(),
    supabase.from("orders").select("*").eq("customer_id", id).order("created_at", { ascending: false }).returns<Order[]>(),
  ]);
  if (!customer) notFound();

  const spent = (orders ?? [])
    .filter((o) => !o.archived_at && ["pagado", "preparando", "enviado", "entregado"].includes(o.stage))
    .reduce((sum, o) => sum + Number(o.total ?? 0), 0);

  return (
    <div className="space-y-6">
      {customer.archived_at && (
        <div className="flex items-center justify-between rounded-lg bg-stone-200 px-4 py-3 text-sm font-medium">
          Este cliente está archivado.
          <ArchiveButton kind="customer" id={customer.id} archived />
        </div>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-sm text-stone-500">Cliente desde {formatDate(customer.created_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black">{formatMoney(spent || null)}</p>
          <p className="text-xs text-stone-500">comprado en total</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Pedidos</h2>
            <Link href="/pedidos/nuevo" className="btn-secondary py-1.5">
              + Nuevo pedido
            </Link>
          </div>
          <ul className="card divide-y divide-stone-100">
            {(orders ?? []).map((o) => {
              const s = STAGES.find((x) => x.id === o.stage)!;
              return (
                <li key={o.id}>
                  <Link href={`/pedidos/${o.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-stone-50 ${o.archived_at ? "opacity-50" : ""}`}>
                    <span className="font-mono text-sm text-stone-500">#{o.number}</span>
                    <span className="min-w-0 flex-1 truncate">{o.description}</span>
                    <span className="text-sm font-semibold">{formatMoney(o.total)}</span>
                    <StageBadge label={o.archived_at ? "Archivado" : s.label} color={s.color} />
                  </Link>
                </li>
              );
            })}
            {!orders?.length && <li className="px-4 py-6 text-center text-stone-500">Sin pedidos.</li>}
          </ul>
        </section>
        <aside className="space-y-4">
          <CustomerEditForm customer={customer} />
          {!customer.archived_at && <ArchiveButton kind="customer" id={customer.id} archived={false} />}
        </aside>
      </div>
    </div>
  );
}
