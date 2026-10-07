// Mensajes de un chat (y lo marca leído). Ruta y no server action: ver api/wa/chats.
import { getWaMessages } from "@/app/wa-actions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const r = await getWaMessages(u.get("line") ?? "", u.get("jid") ?? "");
  return Response.json(r, { headers: { "cache-control": "no-store" } });
}
