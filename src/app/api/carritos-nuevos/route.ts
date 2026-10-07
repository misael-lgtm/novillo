// Carritos abandonados de las últimas 48 h, para el aviso en pantalla cuando entra uno nuevo.
import { requireMember } from "@/lib/session";
import { abandonedCarts, cartMessage, cartSummary } from "@/lib/tiendanube";

export const dynamic = "force-dynamic";

export type NewCart = { id: number; name: string | null; phone: string | null; email: string | null; total: number; summary: string; message: string };

export async function GET() {
  const { me } = await requireMember();
  // La misma consulta que la página de Carritos (30 días): comparten la caché.
  const res = await abandonedCarts(30);
  if (!res?.ok) return Response.json(null, { headers: { "cache-control": "no-store" } });
  const since = Date.now() - 48 * 3600 * 1000;
  const seller = me.name.split(" ")[0];
  const carts: NewCart[] = res.carts
    .filter((c) => Date.parse(c.createdAt) >= since)
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, total: c.total, summary: cartSummary(c), message: cartMessage(c, seller) }));
  return Response.json(carts, { headers: { "cache-control": "no-store" } });
}
