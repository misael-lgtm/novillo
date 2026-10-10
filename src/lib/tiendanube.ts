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
const LOCAL_MARK = /\blocal\s*\/\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\s*\/\s*(palermo|g[uü]emes)/i;
/** De la nota de un pedido: el local y el vendedor ("local/fabricio/guemes" → guemes, Fabricio). */
export function localOf(note: string): { local: "palermo" | "guemes"; seller: string } | null {
  const m = note.match(LOCAL_MARK);
  if (!m) return null;
  return { local: /palermo/i.test(m[2]) ? "palermo" : "guemes", seller: m[1] };
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
  customer?: { phone?: string | null; email?: string | null } | null;
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
  voided: "anulado",
};

/**
 * Ventas de la tienda del mes (hora argentina, UTC-3). Se toman por fecha de pago (o de creación si no tiene).
 * Pide los pedidos actualizados desde el día 1, así entran los creados antes pero cobrados este mes.
 * null si no está conectada.
 */
export async function storeSalesForMonth(month: string, { fresh = false }: { fresh?: boolean } = {}): Promise<StoreSales | null> {
  if (!isConnected()) return null;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const from = new Date(`${month}T00:00:00-03:00`).getTime();
  const to = new Date(`${next}T00:00:00-03:00`).getTime();

  const off: TnSale[] = [];
  const local: TnLocalSale[] = [];
  const checks: TnCheck[] = [];
  const byOrigin: Record<string, { total: number; ventas: number }> = {};
  let read = 0;
  try {
    for (let page = 1; page <= 100; page++) {
      const url = new URL(`${API}/${tiendanube.storeId}/orders`);
      url.search = new URLSearchParams({
        updated_at_min: new Date(from).toISOString(),
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
        const paid = o.payment_status === "paid" && o.status !== "cancelled";
        if (paid) {
          const b = (byOrigin[origin] ??= { total: 0, ventas: 0 });
          b.total += total;
          b.ventas += 1;
          const loc = localOf(text);
          // Los cambios sin diferencia ($0) no son ventas.
          if (loc && !isOff && total > 0) local.push({ id: o.id, number: o.number ?? null, total, local: loc.local, seller: loc.seller, date });
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
  return { ok: true, off, local, byOrigin, checks, read };
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
  carts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, carts };
}

/** "Buzo Alaska (M) x2, Remera Lino (L)" */
export function cartSummary(c: TnCart): string {
  return c.products.map((p) => `${p.name}${p.variant ? ` (${p.variant})` : ""}${p.qty > 1 ? ` x${p.qty}` : ""}`).join(", ");
}

/** Mensaje para escribirle por WhatsApp a alguien que dejó el carrito. */
export function cartMessage(c: TnCart, seller: string): string {
  const first = (c.name ?? "").split(" ")[0];
  return `Hola${first ? ` ${first}` : ""}! Te habla ${seller} de Wayfarer 🤙 Vimos que te quedó en el carrito ${cartSummary(c)}. ¿Te ayudo a terminar la compra?${c.url ? ` Acá lo tenés: ${c.url}` : ""}`;
}

// ── Pedidos por transferencia sin acreditar (para el mensaje automático) ──

export type TnPendingTransfer = { id: number; number: number | null; phone: string | null; createdAt: string; gateway: string };

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
