// Ventas off del mes para el festejo en pantalla. Ruta y no server action: Tiendanube puede tardar y no tiene que frenar lo demás.
import { getOffSalesFeed } from "@/app/goal-actions";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getOffSalesFeed(), { headers: { "cache-control": "no-store" } });
}
