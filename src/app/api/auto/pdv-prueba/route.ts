// Prueba para el PDV de Tiendanube: crea (oculto y sin stock) una copia del conjunto de lino con la variante
// separada en Camisa / Bermuda / Talle, para ver cómo se elige en el punto de venta. Solo con la clave del reloj.
//   ?clave=…            → crea la prueba (si ya existe, la muestra)
//   ?clave=…&borrar=1   → borra la prueba (solo ese producto, por su nombre exacto)
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { splitConjunto } from "@/lib/pdv";
import { isConnected, tiendanube } from "@/lib/tiendanube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = process.env.TIENDANUBE_API_URL?.trim() || "https://api.tiendanube.com/v1";
const UA = "Wayfarer CRM (https://wayfarer-crm.vercel.app)";
const ORIGINAL = "Conjunto Lino | Camisa & Bermuda";
const PRUEBA = "PRUEBA PDV - Conjunto Lino (no vender)";

const es = (x: unknown) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>).es ?? Object.values(x)[0] ?? "") : "").trim();
const tn = (path: string, init?: RequestInit) =>
  fetch(`${API}/${tiendanube.storeId}/${path}`, {
    ...init,
    headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA, "Content-Type": "application/json" },
    cache: "no-store",
  });

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: valid } = await db.rpc("auto_check_key", { p_key: u.get("clave") ?? u.get("key") ?? "" });
  if (!valid) return Response.json({ error: "clave inválida" }, { status: 401 });
  if (!isConnected()) return Response.json({ error: "Tiendanube no conectado" }, { status: 502 });

  const find = async (name: string) => {
    const res = await tn(`products?q=${encodeURIComponent(name)}&per_page=50&fields=id,name,attributes,variants,published`);
    if (!res.ok) return { error: `Tiendanube respondió ${res.status} al buscar` } as const;
    const list = (await res.json()) as { id: number; name: unknown; attributes?: unknown[]; published?: boolean; variants?: { values?: unknown[]; price?: string; sku?: string | null }[] }[];
    return { product: list.find((p) => es(p.name) === name) ?? null } as const;
  };

  const existing = await find(PRUEBA);
  if ("error" in existing) return Response.json(existing, { status: 502 });

  if (u.get("borrar") === "1") {
    if (!existing.product) return Response.json({ ok: true, borrado: false, motivo: "no existe" });
    const res = await tn(`products/${existing.product.id}`, { method: "DELETE" });
    return Response.json({ ok: res.ok, borrado: res.ok, status: res.status });
  }
  if (existing.product) return Response.json({ ok: true, yaExistia: true, id: existing.product.id, variantes: existing.product.variants?.length ?? 0 });

  const orig = await find(ORIGINAL);
  if ("error" in orig) return Response.json(orig, { status: 502 });
  if (!orig.product) return Response.json({ error: `no encontré "${ORIGINAL}"` }, { status: 404 });
  const attrs = (orig.product.attributes ?? []).map(es);
  const iCombo = attrs.findIndex((a) => /combinaci/i.test(a));
  const iTalle = attrs.findIndex((a) => /talle/i.test(a));
  if (iCombo < 0 || iTalle < 0) return Response.json({ error: "el original no tiene Combinación y Talle", attrs }, { status: 422 });

  const seen = new Set<string>();
  const skipped: string[] = [];
  const variants: { values: { es: string }[]; price: string; stock: number }[] = [];
  for (const v of orig.product.variants ?? []) {
    const values = (v.values ?? []).map(es);
    const parts = splitConjunto(values[iCombo] ?? "");
    if (!parts) {
      skipped.push(values[iCombo] ?? "?");
      continue;
    }
    const key = [...parts, values[iTalle]].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({ values: [{ es: parts[0] }, { es: parts[1] }, { es: values[iTalle] }], price: v.price ?? "0", stock: 0 });
  }

  const res = await tn("products", {
    method: "POST",
    body: JSON.stringify({
      name: { es: PRUEBA },
      description: { es: "Producto de prueba para ver cómo se elige el conjunto en el punto de venta. No vender. Se puede borrar." },
      published: false,
      attributes: [{ es: "Camisa" }, { es: "Bermuda" }, { es: "Talle" }],
      variants,
    }),
  });
  if (res.status === 401 || res.status === 403)
    return Response.json({ error: "La app no tiene permiso para editar productos todavía", status: res.status }, { status: 403 });
  const body = (await res.json().catch(() => null)) as { id?: number; variants?: unknown[] } | null;
  if (!res.ok) return Response.json({ error: `Tiendanube respondió ${res.status}`, body }, { status: 502 });
  return Response.json({ ok: true, id: body?.id, variantes: body?.variants?.length ?? 0, enviadas: variants.length, salteadas: skipped });
}
