// Contador de personas que escribieron desde anuncios de Meta. Ruta y no server action: ver api/wa/chats.
import { getWaAdStats } from "@/app/wa-actions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const r = await getWaAdStats(new URL(req.url).searchParams.get("line") ?? "");
  return Response.json(r, { headers: { "cache-control": "no-store" } });
}
