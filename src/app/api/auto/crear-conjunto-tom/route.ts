// Crea en Tiendanube, OCULTO y sin stock, el "Conjunto Lino | Camisa & Pantalón Tom". Solo con la clave del reloj.
// Si ya existe uno con ese nombre, no crea otro.
import { createClient } from "@supabase/supabase-js";
import { CONJUNTO_TOM, conjuntoTomVariants } from "@/lib/conjunto-tom";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { isConnected, tiendanube } from "@/lib/tiendanube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = process.env.TIENDANUBE_API_URL?.trim() || "https://api.tiendanube.com/v1";
const UA = "Wayfarer CRM (https://wayfarer-crm.vercel.app)";
const es = (x: unknown) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>).es ?? "") : "").trim();
const tn = (path: string, init?: RequestInit) =>
  fetch(`${API}/${tiendanube.storeId}/${path}`, {
    ...init,
    headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA, "Content-Type": "application/json" },
    cache: "no-store",
  });

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: valid } = await db.rpc("auto_check_key", { p_key: u.get("key") ?? "" });
  if (!valid) return Response.json({ error: "clave inválida" }, { status: 401 });
  if (!isConnected()) return Response.json({ error: "Tiendanube no conectado" }, { status: 502 });

  const found = await tn(`products?q=${encodeURIComponent("Pantalón Tom")}&per_page=100&fields=id,name,published`);
  if (!found.ok) return Response.json({ error: `Tiendanube respondió ${found.status} al buscar` }, { status: 502 });
  const dup = ((await found.json()) as { id: number; name: unknown; published?: boolean }[]).find((p) => es(p.name) === CONJUNTO_TOM.name);
  if (dup) return Response.json({ ok: true, yaExistia: true, id: dup.id, publicado: dup.published });

  const variants = conjuntoTomVariants();
  const res = await tn("products", {
    method: "POST",
    body: JSON.stringify({
      name: { es: CONJUNTO_TOM.name },
      description: { es: "<p>Conjunto de Camisa de Lino + Pantalón Tom. Elegí la combinación de colores y el talle.</p>" },
      published: false,
      attributes: [{ es: "Combinacion" }, { es: "Talle" }],
      variants,
    }),
  });
  const body = (await res.json().catch(() => null)) as { id?: number; variants?: unknown[] } | null;
  if (!res.ok) return Response.json({ error: `Tiendanube respondió ${res.status}`, body }, { status: 502 });
  return Response.json({ ok: true, id: body?.id, variantes: body?.variants?.length ?? 0, enviadas: variants.length });
}
