// Ventas de la tienda online (Tiendanube) para los objetivos del mes.
// El token vive solo en las variables de entorno del servidor (Vercel), nunca en el navegador ni en la base.

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
export async function storeSalesForMonth(month: string): Promise<StoreSales | null> {
  if (!isConnected()) return null;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const from = new Date(`${month}T00:00:00-03:00`).getTime();
  const to = new Date(`${next}T00:00:00-03:00`).getTime();

  const off: TnSale[] = [];
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
        // Se vuelve a pedir a lo sumo cada 10 minutos.
        next: { revalidate: 600 },
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
  return { ok: true, off, byOrigin, checks, read };
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
