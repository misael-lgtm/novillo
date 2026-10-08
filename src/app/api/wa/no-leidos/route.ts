// Cuántos chats sin leer tiene cada teléfono (para las pestañas y el menú).
import { PHONE_LINES } from "@/lib/config";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("wa_chat_list").select("line, phone, jid").gt("unread", 0).limit(5000);
  const counts: Record<string, number> = Object.fromEntries(PHONE_LINES.map((l) => [l.id, 0]));
  // Un chat por persona (el número y el @lid de la misma persona cuentan una vez).
  const seen = new Set<string>();
  for (const c of data ?? []) {
    const key = `${c.line}:${c.phone ?? c.jid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[c.line] = (counts[c.line] ?? 0) + 1;
  }
  return Response.json(counts, { headers: { "cache-control": "no-store" } });
}
