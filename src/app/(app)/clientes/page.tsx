import Link from "next/link";
import { formatPhone, normalizeInstagram } from "@/lib/rules";
import { requireMember } from "@/lib/session";
import type { Customer } from "@/lib/types";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireMember();

  let query = supabase
    .from("customers")
    .select("*, orders(count)")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const term = q.trim().replace(/["\\%,()]/g, "");
  if (term) {
    const ors = [`name.ilike."%${term}%"`];
    const ig = normalizeInstagram(term);
    if (ig) ors.push(`instagram.ilike."%${ig}%"`);
    const digits = term.replace(/\D/g, "");
    if (digits.length >= 6) ors.push(`phone.like."%${digits.slice(-8)}%"`);
    query = query.or(ors.join(","));
  }
  const { data } = await query.returns<(Customer & { orders: { count: number }[] })[]>();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Clientes</h1>
        <form className="w-full sm:w-80">
          <input name="q" defaultValue={q} className="input" placeholder="Buscar nombre, @ig o celular…" />
        </form>
      </div>
      <p className="text-sm text-stone-500">Los clientes se crean solos al cargar un pedido nuevo.</p>
      <ul className="card divide-y divide-stone-100">
        {(data ?? []).map((c) => (
          <li key={c.id}>
            <Link href={`/clientes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
              <div className="min-w-0">
                <p className="font-semibold">{c.name}</p>
                <p className="truncate text-sm text-stone-500">
                  {[c.instagram && `@${c.instagram}`, c.phone && formatPhone(c.phone), c.city].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-sm text-stone-500">
                {c.orders[0]?.count ?? 0} {c.orders[0]?.count === 1 ? "pedido" : "pedidos"}
              </span>
            </Link>
          </li>
        ))}
        {!data?.length && <li className="px-4 py-6 text-center text-stone-500">{q ? `Nadie coincide con “${q}”.` : "Todavía no hay clientes."}</li>}
      </ul>
    </div>
  );
}
