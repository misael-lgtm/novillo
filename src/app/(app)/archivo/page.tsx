import Link from "next/link";
import { stageLabel } from "@/lib/config";
import { ORDER_SELECT } from "@/lib/queries";
import { formatMoney } from "@/lib/rules";
import { requireMember } from "@/lib/session";
import type { Customer, OrderWithCustomer } from "@/lib/types";
import { ArchiveButton } from "@/components/ArchiveButton";

export default async function ArchivePage() {
  const { supabase } = await requireMember();
  const [{ data: orders }, { data: customers }] = await Promise.all([
    supabase.from("orders").select(ORDER_SELECT).not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(100).returns<OrderWithCustomer[]>(),
    supabase.from("customers").select("*").not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(100).returns<Customer[]>(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Archivo</h1>
        <p className="text-sm text-stone-500">Lo archivado no se borra nunca. Desde acá lo podés restaurar.</p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Pedidos archivados</h2>
        <ul className="card divide-y divide-stone-100">
          {(orders ?? []).map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/pedidos/${o.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="font-mono text-sm text-stone-500">#{o.number}</span> {o.customer.name} · <span className="text-stone-500">{o.description}</span>
              </Link>
              <span className="hidden text-sm sm:inline">{formatMoney(o.total)} · {stageLabel(o.stage)}</span>
              <ArchiveButton kind="order" id={o.id} archived />
            </li>
          ))}
          {!orders?.length && <li className="px-4 py-6 text-center text-stone-500">Nada archivado.</li>}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Clientes archivados</h2>
        <ul className="card divide-y divide-stone-100">
          {(customers ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/clientes/${c.id}`} className="flex-1 hover:underline">
                {c.name} {c.instagram && <span className="text-stone-500">@{c.instagram}</span>}
              </Link>
              <ArchiveButton kind="customer" id={c.id} archived />
            </li>
          ))}
          {!customers?.length && <li className="px-4 py-6 text-center text-stone-500">Nada archivado.</li>}
        </ul>
      </section>
    </div>
  );
}
