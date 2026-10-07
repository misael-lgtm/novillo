// Lista de chats de un teléfono (la pantalla la pide cada pocos segundos).
// Es una ruta y no una server action porque las server actions salen de a una: así no frena al abrir una conversación.
import { getWaLine } from "@/app/wa-actions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const r = await getWaLine(u.get("line") ?? "", u.get("q") ?? undefined, u.get("label") || undefined);
  return Response.json(r, { headers: { "cache-control": "no-store" } });
}
