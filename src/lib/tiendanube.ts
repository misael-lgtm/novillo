// Ventas de la tienda online (Tiendanube) para los objetivos del mes, y los carritos abandonados.
// El token vive solo en las variables de entorno del servidor (Vercel), nunca en el navegador ni en la base.

import { normalizePhoneAR } from "./rules";

// TIENDANUBE_API_URL solo para pruebas locales (un Tiendanube de mentira).
const API = process.env.TIENDANUBE_API_URL?.trim() || "https://api.tiendanube.com/v1";
// Tiendanube pide un User-Agent que identifique la app.
const UA = "Wayfarer CRM (https://wayfarer-crm.vercel.app)";

export const tiendanube = {
  appId: process.env.TIENDANUBE_APP_ID?.trim() || null,
  clientSecret: process.env.TIENDANUBE_CLIENT_SECRET?.trim() || null,
  storeId: process.env.TIENDANUBE_STORE_ID?.trim() || null,
  token: process.env.TIENDANUBE_TOKEN?.trim() || null,
};

export const isConnected = () => !!(tiendanube.storeId && tiendanube.token);

/** Pedido pagado de la tienda, con lo necesario para asignarlo a un vendedor. */
export type TnSale = {
  id: number;
  number: number | null;
  total: number;
  origin: string;
  phone: string | null;
  email: string | null;
  /** Notas y nombres del pedido, donde los chicos escriben "OFF/Mariano". */
  note: string;
  /** El nombre que va después de "OFF/" (ej. "Mariano"), si lo tiene. */
  offName: string | null;
};

/** Así marcan los chicos sus ventas en Tiendanube: "OFF/Mariano", "OFF / Fabricio", "off-Bruno"… */
const OFF_MARK = /\bOFF\s*[\/|\-]\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/i;

/** Venta de un local: en la nota dicen "local/Fabricio/Guemes/point mp". */
export type TnLocalSale = { id: number; number: number | null; total: number; local: "palermo" | "guemes"; seller: string | null; date: string };
const LOCAL_WORDS = /^(local|cambio|cambios|p|g|palermo|g[uü]emes|eft|efectivo|point|mp|debito|d[eé]b|cred|cr[eé]dito|transfe|transferencia|payway|qr)$/i;
/**
 * De la nota de un pedido: el local y el vendedor. Acepta el orden que usan los chicos:
 * "local/fabricio/guemes", "Local/Palermo/Luana/deb", "Local/Styven/Cambio/Palermo", "Local/P/Cambio/Luana" (P = Palermo, G = Güemes).
 */
export function localOf(note: string): { local: "palermo" | "guemes"; seller: string | null } | null {
  const m = note.match(/\blocal\s*\/([^\n·]*)/i);
  if (!m) return null;
  const parts = m[1].split("/").map((x) => x.trim()).filter(Boolean).slice(0, 4);
  let local: "palermo" | "guemes" | null = null;
  let seller: string | null = null;
  for (const raw of parts) {
    const w = raw.split(/\s+/)[0];
    if (!local && /^(palermo|p)$/i.test(w)) local = "palermo";
    else if (!local && /^(g[uü]emes|g)$/i.test(w)) local = "guemes";
    else if (!seller && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,20}$/.test(w) && !LOCAL_WORDS.test(w)) seller = w;
  }
  return local ? { local, seller } : null;
}

/** Fila para revisar en /tiendanube: cada pedido off (o casi) y si cuenta o por qué no. */
export type TnCheck = {
  id: number;
  number: number | null;
  total: number;
  origin: string;
  date: string;
  offName: string | null;
  counted: boolean;
  reason: string | null;
};

export type StoreSales =
  | {
      ok: true;
      /** Solo las ventas off que cuentan para los objetivos. */
      off: TnSale[];
      /** Ventas de los locales ("local/Nombre/Palermo"), pagadas en el mes. */
      local?: TnLocalSale[];
      /** Pedidos que parecen de un local pero no cuentan, con el motivo (para revisar diferencias). */
      localChecks?: { id?: number; number: number | null; total: number; date: string; note: string; reason: string }[];
      /** Todos los pedidos pagados del mes por origen, para revisar qué se cuenta y qué no. */
      byOrigin: Record<string, { total: number; ventas: number }>;
      /** Pedidos con "OFF/" o de origen manual (cuenten o no), para revisar. */
      checks: TnCheck[];
      /** Cuántos pedidos se leyeron de Tiendanube en total. */
      read: number;
    }
  | { ok: false; error: string };

// Origen ("storefront") de los pedidos que se cargan a mano desde el panel de Tiendanube.
// Se puede cambiar sin tocar código con TIENDANUBE_OFF_ORIGINS (ej. "form,pos").
export const OFF_ORIGINS = (process.env.TIENDANUBE_OFF_ORIGINS?.trim() || "form")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

export const ORIGIN_LABELS: Record<string, string> = {
  store: "Compras en la web",
  form: "Pedidos manuales (off)",
  pos: "Punto de venta (local)",
  meli: "Mercado Libre",
  api: "Otras apps",
};

type TnOrder = {
  id: number;
  number?: number;
  total: string;
  status: string;
  payment_status: string;
  storefront?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  customer?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  [k: string]: unknown;
};

/** Las notas del pedido (la del vendedor y la del cliente): ahí los chicos escriben "off/Fabricio/wsp / comp ICBC". */
function noteText(o: TnOrder): string {
  return [o.owner_note, o.note].filter((x): x is string => typeof x === "string" && !!x.trim()).join(" · ");
}

const PAYMENT_LABELS: Record<string, string> = {
  pending: "pago pendiente",
  authorized: "pago autorizado, sin acreditar",
  abandoned: "abandonado",
  refunded: "devuelto",
  partially_paid: "pago parcial",
  voided: "anulado",
};

/**
 * Ventas de la tienda del mes (hora argentina, UTC-3). Se toman por fecha de pago (o de creación si no tiene).
 * Pide los pedidos actualizados desde el día 1, así entran los creados antes pero cobrados este mes.
 * null si no está conectada.
 */
export async function storeSalesForMonth(
  month: string,
  { fresh = false, updatedSince }: { fresh?: boolean; updatedSince?: number } = {},
): Promise<(StoreSales & { seen?: number[] }) | null> {
  if (!isConnected()) return null;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const from = new Date(`${month}T00:00:00-03:00`).getTime();
  const to = new Date(`${next}T00:00:00-03:00`).getTime();

  const off: TnSale[] = [];
  const local: TnLocalSale[] = [];
  const checks: TnCheck[] = [];
  // Para revisar diferencias de los locales: pedidos que parecen de un local pero no cuentan (y por qué).
  const localChecks: { id: number; number: number | null; total: number; date: string; note: string; reason: string }[] = [];
  const byOrigin: Record<string, { total: number; ventas: number }> = {};
  // Ids de todos los pedidos leídos (para la actualización parcial: se reemplazan en lo guardado).
  const seen: number[] = [];
  let read = 0;
  try {
    for (let page = 1; page <= 100; page++) {
      const url = new URL(`${API}/${tiendanube.storeId}/orders`);
      url.search = new URLSearchParams({
        // Parcial: solo lo que cambió desde la última vez (mucho más rápido que releer todo el mes).
        updated_at_min: new Date(Math.max(from, updatedSince ?? from)).toISOString(),
        status: "any",
        per_page: "200",
        page: String(page),
      }).toString();
      const res = await fetch(url, {
        headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA },
        // Se vuelve a pedir a lo sumo cada 2 minutos (lo comparten todos los que tienen el CRM abierto).
        // fresh: el reloj, que guarda el resultado en la base (sin caché, siempre lo último).
        ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: Number(process.env.TIENDANUBE_REVALIDATE_SECONDS) || 120 } }),
      });
      // Tiendanube devuelve 404 cuando la página ya no tiene pedidos.
      if (res.status === 404) break;
      if (res.status === 401 || res.status === 403) return { ok: false, error: "Tiendanube rechazó el token" };
      if (!res.ok) return { ok: false, error: `Tiendanube respondió ${res.status}` };
      const orders = (await res.json()) as TnOrder[];
      read += orders.length;
      for (const o of orders) {
        seen.push(o.id);
        const date = o.paid_at || o.created_at || "";
        const t = Date.parse(date);
        if (Number.isFinite(t) && !(t >= from && t < to)) continue; // de otro mes (sin fecha: se cuenta, ya vino filtrado por actualización)
        const origin = o.storefront || "desconocido";
        const total = Number(o.total) || 0;
        const text = noteText(o);
        const offName = text.match(OFF_MARK)?.[1] ?? null;
        const manual = OFF_ORIGINS.includes(origin);
        // Venta off = marcada "off/Nombre" en las notas. Los manuales sin marca se muestran para revisar, pero no cuentan.
        const isOff = !!offName;
        // También son venta: "partially_refunded" (le devolvieron una parte, ej. sacaron un producto) y
        // "partially_paid" (pagó una parte, ej. una seña). Cuentan en la facturación, la cantidad y el ticket promedio.
        const paid = ["paid", "partially_refunded", "partially_paid"].includes(o.payment_status) && o.status !== "cancelled";
        if (paid) {
          const b = (byOrigin[origin] ??= { total: 0, ventas: 0 });
          b.total += total;
          b.ventas += 1;
          const loc = localOf(text);
          // Los cambios sin diferencia ($0) no son ventas.
          if (loc && !isOff && total > 0) local.push({ id: o.id, number: o.number ?? null, total, local: loc.local, seller: loc.seller, date });
        }
        {
          const loc = localOf(text);
          const looksLocal = /palermo|g[uü]emes|\blocal\b/i.test(text) || (origin === "pos" && !isOff);
          const why =
            o.status === "cancelled"
              ? "cancelado"
              : !paid
                ? (PAYMENT_LABELS[o.payment_status] ?? `pago: ${o.payment_status}`)
                : isOff
                  ? "tiene off/ (cuenta como venta off)"
                  : !loc
                    ? "la nota no dice local/Nombre/Palermo o Güemes"
                    : total <= 0
                      ? "monto $0 (cambio)"
                      : null;
          if (looksLocal && why) localChecks.push({ id: o.id, number: o.number ?? null, total, date, note: text.slice(0, 120), reason: why });
        }
        if (!isOff && !manual) continue;
        const reason = !isOff
          ? "sin “off/Nombre” en las notas"
          : o.status === "cancelled"
            ? "cancelado"
            : paid
              ? null
              : (PAYMENT_LABELS[o.payment_status] ?? `pago: ${o.payment_status}`);
        checks.push({ id: o.id, number: o.number ?? null, total, origin, date, offName, counted: isOff && paid, reason });
        if (!isOff || !paid) continue;
        off.push({
          id: o.id,
          number: o.number ?? null,
          total,
          origin,
          phone: o.contact_phone || o.customer?.phone || null,
          email: (o.contact_email || o.customer?.email || null)?.toLowerCase() ?? null,
          note: text,
          offName,
        });
      }
      if (orders.length < 200) break;
    }
  } catch {
    return { ok: false, error: "No se pudo conectar con Tiendanube" };
  }
  checks.sort((a, b) => b.date.localeCompare(a.date));
  return { ok: true, off, local, localChecks, byOrigin, checks, read, seen };
}

export type TnCustomer = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  totalSpent: number | null;
};

type TnCustomerRaw = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  total_spent?: string | null;
  billing_phone?: string | null;
  billing_city?: string | null;
  billing_province?: string | null;
  default_address?: { phone?: string | null; city?: string | null; province?: string | null } | null;
};

/** Una página (hasta 200) de clientes de la tienda. `done` cuando no hay más. */
export async function fetchCustomersPage(page: number): Promise<{ ok: true; customers: TnCustomer[]; done: boolean } | { ok: false; error: string }> {
  if (!isConnected()) return { ok: false, error: "La tienda no está conectada." };
  try {
    const url = new URL(`${API}/${tiendanube.storeId}/customers`);
    url.search = new URLSearchParams({ per_page: "200", page: String(page) }).toString();
    const res = await fetch(url, { headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA }, cache: "no-store" });
    if (res.status === 404) return { ok: true, customers: [], done: true };
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Tiendanube rechazó el token" };
    if (!res.ok) return { ok: false, error: `Tiendanube respondió ${res.status}` };
    const raw = (await res.json()) as TnCustomerRaw[];
    const customers = raw.map((c) => ({
      id: c.id,
      name: c.name?.trim() || null,
      email: c.email?.trim().toLowerCase() || null,
      phone: c.phone || c.billing_phone || c.default_address?.phone || null,
      city: c.default_address?.city || c.billing_city || c.default_address?.province || c.billing_province || null,
      totalSpent: c.total_spent != null && c.total_spent !== "" ? Number(c.total_spent) : null,
    }));
    return { ok: true, customers, done: raw.length < 200 };
  } catch {
    return { ok: false, error: "No se pudo conectar con Tiendanube" };
  }
}

/** Paso final de la autorización: cambia el "code" por el token de la tienda. */
export async function exchangeCode(code: string): Promise<{ ok: true; token: string; storeId: string } | { ok: false; error: string }> {
  if (!tiendanube.appId || !tiendanube.clientSecret) return { ok: false, error: "Faltan TIENDANUBE_APP_ID y TIENDANUBE_CLIENT_SECRET en Vercel." };
  try {
    const res = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        client_id: tiendanube.appId,
        client_secret: tiendanube.clientSecret,
        grant_type: "authorization_code",
        code,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; user_id?: number | string; error_description?: string };
    if (!res.ok || !data.access_token || !data.user_id) {
      return { ok: false, error: data.error_description ?? `Tiendanube respondió ${res.status}. Probá autorizar de nuevo (el código vence rápido).` };
    }
    return { ok: true, token: data.access_token, storeId: String(data.user_id) };
  } catch {
    return { ok: false, error: "No se pudo conectar con Tiendanube." };
  }
}

// ── Carritos abandonados ──────────────────────────────────────

/** Carrito que quedó sin pagar en la tienda (Tiendanube los guarda unos 30 días). */
export type TnCart = {
  id: number;
  name: string | null;
  /** Celular normalizado (549…), si dejó uno que se entienda. */
  phone: string | null;
  email: string | null;
  total: number;
  products: { name: string; variant: string | null; qty: number }[];
  /** Link para que la persona retome la compra. */
  url: string | null;
  createdAt: string;
};

type TnCheckout = {
  id: number;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  billing_name?: string | null;
  shipping_name?: string | null;
  total?: string | number | null;
  abandoned_checkout_url?: string | null;
  created_at?: string | null;
  products?: { name?: string | Record<string, string>; variant_values?: string[] | null; quantity?: number | string }[];
};

const textOf = (x: unknown) => (typeof x === "string" ? x : x && typeof x === "object" ? (Object.values(x as Record<string, string>)[0] ?? "") : "");

/** Los carritos abandonados de los últimos días, del más nuevo al más viejo. null si la tienda no está conectada. */
export async function abandonedCarts(days = 30): Promise<{ ok: true; carts: TnCart[] } | { ok: false; error: string } | null> {
  if (!isConnected()) return null;
  // Redondeado al día: así la dirección es la misma todo el día y la caché de 2 minutos sirve para todos.
  const since = new Date(Math.floor((Date.now() - days * 86400000) / 86400000) * 86400000).toISOString();
  const carts: TnCart[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const url = new URL(`${API}/${tiendanube.storeId}/checkouts`);
      url.search = new URLSearchParams({ created_at_min: since, per_page: "200", page: String(page) }).toString();
      const res = await fetch(url, {
        headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA },
        next: { revalidate: Number(process.env.TIENDANUBE_REVALIDATE_SECONDS) || 120 },
      });
      if (res.status === 404) break;
      if (res.status === 401 || res.status === 403) return { ok: false, error: "Tiendanube no dio permiso para ver los carritos abandonados" };
      if (!res.ok) return { ok: false, error: `Tiendanube respondió ${res.status}` };
      const list = (await res.json()) as TnCheckout[];
      for (const c of list) {
        carts.push({
          id: c.id,
          name: (c.contact_name || c.billing_name || c.shipping_name || "").trim() || null,
          phone: normalizePhoneAR(c.contact_phone ?? null),
          email: c.contact_email?.trim().toLowerCase() || null,
          total: Number(c.total) || 0,
          products: (c.products ?? []).map((p) => ({
            name: textOf(p.name).trim() || "Producto",
            variant: p.variant_values?.filter(Boolean).join(" / ") || null,
            qty: Number(p.quantity) || 1,
          })),
          url: c.abandoned_checkout_url || null,
          createdAt: c.created_at || "",
        });
      }
      if (list.length < 200) break;
    }
  } catch {
    return { ok: false, error: "No se pudo conectar con Tiendanube" };
  }
  // Fuera los carritos vacíos ($0) y los de gente que después hizo un pedido (compró, o dejó la transferencia pendiente).
  const buyers = await buyersSince(since);
  const bought = (c: TnCart) => {
    const t = Date.parse(c.createdAt) || 0;
    const at = Math.max(c.email ? (buyers.email.get(c.email) ?? 0) : 0, c.phone ? (buyers.phone.get(c.phone) ?? 0) : 0);
    return at >= t - 10 * 60_000; // el pedido es posterior al carrito (con 10 min de margen)
  };
  const live = carts.filter((c) => c.total > 0 && c.products.length > 0 && !bought(c));
  live.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, carts: live };
}

/** Quiénes hicieron un pedido (no cancelado) desde esa fecha: el último momento por mail y por celular. */
async function buyersSince(sinceIso: string): Promise<{ email: Map<string, number>; phone: Map<string, number> }> {
  const email = new Map<string, number>();
  const phone = new Map<string, number>();
  try {
    for (let page = 1; page <= 30; page++) {
      const url = new URL(`${API}/${tiendanube.storeId}/orders`);
      url.search = new URLSearchParams({
        created_at_min: sinceIso,
        per_page: "200",
        page: String(page),
        fields: "id,status,created_at,contact_email,contact_phone,customer",
      }).toString();
      const res = await fetch(url, {
        headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA },
        next: { revalidate: Number(process.env.TIENDANUBE_REVALIDATE_SECONDS) || 120 },
      });
      if (!res.ok) break;
      const list = (await res.json()) as TnOrder[];
      for (const o of list) {
        if (o.status === "cancelled") continue;
        const t = Date.parse(o.created_at ?? "") || 0;
        const e = (o.contact_email || o.customer?.email || "").trim().toLowerCase();
        const p = normalizePhoneAR(o.contact_phone || o.customer?.phone || null);
        if (e && t > (email.get(e) ?? 0)) email.set(e, t);
        if (p && t > (phone.get(p) ?? 0)) phone.set(p, t);
      }
      if (list.length < 200) break;
    }
  } catch {
    // sin pedidos: se muestran todos los carritos
  }
  return { email, phone };
}

/** "Buzo Alaska (M) x2, Remera Lino (L)" */
export function cartSummary(c: TnCart): string {
  return c.products.map((p) => `${p.name}${p.variant ? ` (${p.variant})` : ""}${p.qty > 1 ? ` x${p.qty}` : ""}`).join(", ");
}

/** Mensaje para escribirle por WhatsApp a alguien que dejó el carrito. */
export const CART_MESSAGE = `Hola! Cómo estás? Te habla Fabri, de Wayfarer.

Vimos que tenes un carrito armado y no pudiste finalizar tu compra. Queríamos verificar si vas a completarla; de lo contrario, tendremos que liberar el producto que quedó reservado en la orden.

Por otro lado, si la finalizas dentro de las próximas 3 horas, ¡te puedo aplicar un 5% OFF adicional!

¡Avisame si te interesa!`;

/** Mensaje para escribirle a alguien que dejó el carrito (el mismo texto que la respuesta rápida /carrito). */
export function cartMessage(): string {
  return CART_MESSAGE;
}

// ── Pedidos por transferencia sin acreditar (para el mensaje automático) ──

export type TnPendingTransfer = {
  id: number;
  number: number | null;
  phone: string | null;
  createdAt: string;
  gateway: string;
  name: string | null;
  total: number;
  off: string | null;
  local: "palermo" | "guemes" | null;
};

/** Así aparece la transferencia en los pedidos: "Transferencia bancaria", "Depósito o transferencia", método "transfer"… */
export function isTransferOrder(o: { gateway?: unknown; gateway_name?: unknown; payment_details?: { method?: unknown } | null }): boolean {
  const text = [o.gateway_name, o.payment_details?.method, o.gateway].filter((x) => typeof x === "string").join(" ");
  return /transfer|dep[oó]sito|cbu|alias|wire/i.test(text);
}

/**
 * Pedidos creados en la ventana [desde, hasta] que siguen con el pago pendiente y son por transferencia.
 * Sin caché: lo pide el reloj cada 5 minutos.
 */
export async function pendingTransferOrders(fromMs: number, toMs: number): Promise<{ ok: true; orders: TnPendingTransfer[] } | { ok: false; error: string } | null> {
  if (!isConnected()) return null;
  const orders: TnPendingTransfer[] = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const url = new URL(`${API}/${tiendanube.storeId}/orders`);
      url.search = new URLSearchParams({
        created_at_min: new Date(fromMs).toISOString(),
        payment_status: "pending",
        per_page: "200",
        page: String(page),
      }).toString();
      const res = await fetch(url, { headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA }, cache: "no-store" });
      if (res.status === 404) break;
      if (!res.ok) return { ok: false, error: `Tiendanube respondió ${res.status}` };
      const list = (await res.json()) as (TnOrder & { gateway?: string; gateway_name?: string; payment_details?: { method?: string } | null })[];
      for (const o of list) {
        const t = Date.parse(o.created_at ?? "");
        if (!Number.isFinite(t) || t < fromMs || t > toMs) continue;
        if (o.payment_status !== "pending" || o.status === "cancelled" || !isTransferOrder(o)) continue;
        orders.push({
          id: o.id,
          number: o.number ?? null,
          phone: normalizePhoneAR(o.contact_phone || o.customer?.phone || null),
          createdAt: o.created_at ?? "",
          gateway: o.gateway_name || o.payment_details?.method || o.gateway || "",
          name: o.customer?.name || null,
          total: Number(o.total) || 0,
          off: noteText(o).match(OFF_MARK)?.[1] ?? null,
          local: localOf(noteText(o))?.local ?? null,
        });
      }
      if (list.length < 200) break;
    }
  } catch {
    return { ok: false, error: "No se pudo conectar con Tiendanube" };
  }
  return { ok: true, orders };
}

// ── Diagnóstico: de dónde sale la diferencia con las estadísticas de Tiendanube ──

type Tally = { total: number; ventas: number };
const add = (t: Tally, n: number) => {
  t.total += n;
  t.ventas += 1;
};

/** Resumen del mes para comparar con Tiendanube: por fecha de pago y de pedido, con y sin "off/", y los casos raros. */
export async function monthDiagnosis(month: string) {
  if (!isConnected()) return null;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const from = new Date(`${month}T00:00:00-03:00`).getTime();
  const to = new Date(`${next}T00:00:00-03:00`).getTime();
  const inMonth = (iso?: string | null) => {
    const t = Date.parse(iso ?? "");
    return Number.isFinite(t) && t >= from && t < to;
  };
  const r = {
    pagadosPorFechaDePago: { total: 0, ventas: 0 } as Tally,
    pagadosPorFechaDePedido: { total: 0, ventas: 0 } as Tally,
    offQueCuentan: { total: 0, ventas: 0 } as Tally,
    pagadosSinOff: { total: 0, ventas: 0 } as Tally,
    pagadosSinOffPorOrigen: {} as Record<string, Tally>,
    offPedidoDeEsteMesPagadoOtroMes: [] as { n: number | null; total: number; pago: string | null }[],
    offPagadoEsteMesPedidoOtroMes: [] as { n: number | null; total: number; pedido: string | null }[],
    offNoPagadosOCancelados: [] as { n: number | null; total: number; estado: string }[],
    notaParecidaAOffQueNoCuenta: [] as { n: number | null; total: number; nota: string }[],
    sinOffEjemplos: [] as { n: number | null; total: number; origen: string; nota: string }[],
    /** Pedidos por transferencia que siguen esperando el pago (de los últimos 30 días, sin cancelados). */
    transferenciasSinConfirmar: { total: 0, ventas: 0 } as Tally,
    transferenciasSinConfirmarLista: [] as { n: number | null; total: number; creado: string | null; off: boolean; local: string | null }[],
    envioCobradoEnOff: 0,
    descuentosEnOff: 0,
    leidos: 0,
  };
  for (let page = 1; page <= 100; page++) {
    const url = new URL(`${API}/${tiendanube.storeId}/orders`);
    url.search = new URLSearchParams({ updated_at_min: new Date(from - 31 * 86400000).toISOString(), status: "any", per_page: "200", page: String(page) }).toString();
    const res = await fetch(url, { headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA }, cache: "no-store" });
    if (res.status === 404) break;
    if (!res.ok) return { error: `Tiendanube respondió ${res.status}` };
    const orders = (await res.json()) as (TnOrder & { shipping_cost_customer?: string; discount?: string })[];
    r.leidos += orders.length;
    for (const o of orders) {
      const total = Number(o.total) || 0;
      const paid = o.payment_status === "paid" && o.status !== "cancelled";
      const text = noteText(o);
      const offName = text.match(OFF_MARK)?.[1] ?? null;
      const byPaid = inMonth(o.paid_at || o.created_at);
      if (o.payment_status === "pending" && o.status !== "cancelled" && isTransferOrder(o as never) && Date.parse(o.created_at ?? "") >= Date.now() - 30 * 86400000) {
        add(r.transferenciasSinConfirmar, total);
        r.transferenciasSinConfirmarLista.push({ n: o.number ?? null, total, creado: o.created_at ?? null, off: !!offName, local: localOf(text)?.local ?? null });
      }
      const byCreated = inMonth(o.created_at);
      if (paid && byPaid) add(r.pagadosPorFechaDePago, total);
      if (paid && byCreated) add(r.pagadosPorFechaDePedido, total);
      if (offName) {
        if (paid && byPaid) {
          add(r.offQueCuentan, total);
          r.envioCobradoEnOff += Number(o.shipping_cost_customer) || 0;
          r.descuentosEnOff += Number(o.discount) || 0;
        }
        if (paid && byCreated && !byPaid) r.offPedidoDeEsteMesPagadoOtroMes.push({ n: o.number ?? null, total, pago: o.paid_at ?? null });
        if (paid && byPaid && !byCreated) r.offPagadoEsteMesPedidoOtroMes.push({ n: o.number ?? null, total, pedido: o.created_at ?? null });
        if (!paid && (byCreated || byPaid)) r.offNoPagadosOCancelados.push({ n: o.number ?? null, total, estado: `${o.status}/${o.payment_status}` });
      } else if (paid && byPaid) {
        add(r.pagadosSinOff, total);
        add((r.pagadosSinOffPorOrigen[o.storefront || "?"] ??= { total: 0, ventas: 0 }), total);
        if (/\bof+\b|0ff|off\s|\boff$/i.test(text)) r.notaParecidaAOffQueNoCuenta.push({ n: o.number ?? null, total, nota: text.slice(0, 80) });
        else if (r.sinOffEjemplos.length < 40) r.sinOffEjemplos.push({ n: o.number ?? null, total, origen: o.storefront || "?", nota: text.slice(0, 60) });
      }
    }
    if (orders.length < 200) break;
  }
  return r;
}

/** Para ver cómo están cargados los depósitos y el stock por depósito (solo diagnóstico). */
export async function inventoryProbe(): Promise<unknown> {
  if (!isConnected()) return null;
  const get = async (path: string) => {
    const res = await fetch(`${API}/${tiendanube.storeId}/${path}`, { headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA }, cache: "no-store" });
    return { status: res.status, body: res.ok ? await res.json() : (await res.text()).slice(0, 300) };
  };
  const [locations, products, orders] = await Promise.all([get("locations"), get("products?per_page=2&published=true"), get("orders?per_page=50")]);
  // Los nombres de los depósitos también vienen en los pedidos (dónde se preparó cada uno).
  const names: Record<string, unknown> = {};
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(walk);
    const o = x as Record<string, unknown>;
    if (typeof o.location_id === "string" && (o.name || o.location_name)) names[o.location_id] = o.name ?? o.location_name;
    if (typeof o.id === "string" && /^01[A-Z0-9]{24}$/.test(o.id) && o.name) names[o.id] = o.name;
    Object.values(o).forEach(walk);
  };
  walk(orders.body);
  const keys = Array.isArray(orders.body) && orders.body[0] ? Object.keys(orders.body[0] as object) : [];
  const fulfillmentSample = Array.isArray(orders.body) ? (orders.body as Record<string, unknown>[]).map((o) => o.fulfillments ?? o.location_id).find((f) => f) : null;
  const sample = Array.isArray(products.body)
    ? (products.body as { name?: unknown; images?: { src?: string }[]; variants?: Record<string, unknown>[] }[]).map((p) => ({
        name: p.name,
        image: p.images?.[0]?.src,
        variants: (p.variants ?? []).slice(0, 3).map((v) => ({ values: v.values, stock: v.stock, inventory_levels: v.inventory_levels, image_id: v.image_id })),
      }))
    : products.body;
  return { locations, names, orderKeys: keys, fulfillmentSample, productsStatus: products.status, sample };
}

/**
 * Compradores de un producto (por nombre) en un rango de fechas, para armar listas (ej. "pantalón tom").
 * Lee de a tandas de páginas para no pasarse del tiempo: devuelve la página por la que seguir (o null si terminó).
 */
export async function productBuyers(opts: { match: RegExp; from: string; to: string; page: number; pages: number }) {
  if (!isConnected()) return null;
  const rows: { pedido: number | null; fecha: string; nombre: string | null; telefono: string | null; email: string | null; productos: string; total: number; estado: string }[] = [];
  let page = opts.page;
  for (; page < opts.page + opts.pages; page++) {
    const url = new URL(`${API}/${tiendanube.storeId}/orders`);
    url.search = new URLSearchParams({
      created_at_min: new Date(`${opts.from}T00:00:00-03:00`).toISOString(),
      created_at_max: new Date(`${opts.to}T23:59:59-03:00`).toISOString(),
      per_page: "200",
      page: String(page),
      fields: "id,number,status,payment_status,created_at,total,contact_name,contact_email,contact_phone,customer,products",
    }).toString();
    const res = await fetch(url, { headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA }, cache: "no-store" });
    if (res.status === 404) return { rows, next: null };
    if (!res.ok) return { rows, next: page, error: `Tiendanube respondió ${res.status}` };
    const list = (await res.json()) as (TnOrder & { contact_name?: string; products?: { name?: unknown; variant_values?: string[] | null; quantity?: number | string }[] })[];
    for (const o of list) {
      if (o.status === "cancelled" || o.payment_status !== "paid") continue;
      const hits = (o.products ?? []).filter((p) => opts.match.test(textOf(p.name as never)));
      if (!hits.length) continue;
      rows.push({
        pedido: o.number ?? null,
        fecha: (o.created_at ?? "").slice(0, 10),
        nombre: (o.contact_name || o.customer?.name || "").trim() || null,
        telefono: normalizePhoneAR(o.contact_phone || o.customer?.phone || null),
        email: (o.contact_email || o.customer?.email || "").trim().toLowerCase() || null,
        productos: hits.map((p) => `${textOf(p.name as never)}${p.variant_values?.length ? ` (${p.variant_values.join(" / ")})` : ""} x${Number(p.quantity) || 1}`).join(" + "),
        total: Number(o.total) || 0,
        estado: o.payment_status,
      });
    }
    if (list.length < 200) return { rows, next: null };
  }
  return { rows, next: page };
}

/** Pedidos de un rango con envío/retiro que coincide (ej. "retiro en local Güemes"): para revisar diferencias de los locales. */
export async function pickupOrders(opts: { match: RegExp; from: string; to: string; page: number; pages: number }) {
  if (!isConnected()) return null;
  type Row = { pedido: number | null; fecha: string; nombre: string | null; total: number; pago: string; estado: string; envio: string; nota: string };
  const rows: Row[] = [];
  let page = opts.page;
  for (; page < opts.page + opts.pages; page++) {
    const url = new URL(`${API}/${tiendanube.storeId}/orders`);
    url.search = new URLSearchParams({
      created_at_min: new Date(`${opts.from}T00:00:00-03:00`).toISOString(),
      created_at_max: new Date(`${opts.to}T23:59:59-03:00`).toISOString(),
      per_page: "200",
      page: String(page),
    }).toString();
    const res = await fetch(url, { headers: { Authentication: `bearer ${tiendanube.token}`, "User-Agent": UA }, cache: "no-store" });
    if (res.status === 404) return { rows, next: null };
    if (!res.ok) return { rows, next: page, error: `Tiendanube respondió ${res.status}` };
    const list = (await res.json()) as (TnOrder & Record<string, unknown>)[];
    for (const o of list) {
      const envio = [o.shipping_option, o.shipping_store_branch_name, o.shipping_pickup_type, JSON.stringify(o.shipping_pickup_details ?? "")]
        .map((x) => (typeof x === "string" ? x : textOf(x)))
        .filter(Boolean)
        .join(" · ");
      if (!opts.match.test(envio)) continue;
      rows.push({
        pedido: o.number ?? null,
        fecha: (o.paid_at || o.created_at || "").slice(0, 10),
        nombre: ((o.contact_name as string) || o.customer?.name || "").trim() || null,
        total: Number(o.total) || 0,
        pago: o.payment_status,
        estado: o.status,
        envio: envio.slice(0, 160),
        nota: noteText(o).slice(0, 160),
      });
    }
    if (list.length < 200) return { rows, next: null };
  }
  return { rows, next: page };
}
