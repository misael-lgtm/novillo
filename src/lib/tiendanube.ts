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
export type TnSale = { id: number; number: number | null; total: number; origin: string; phone: string | null; email: string | null; note: string };

export type StoreSales =
  | {
      ok: true;
      /** Solo las ventas off (pedidos manuales): son las que cuentan para los objetivos. */
      off: TnSale[];
      /** Todos los pedidos pagados del mes por origen, para revisar qué se cuenta y qué no. */
      byOrigin: Record<string, { total: number; ventas: number }>;
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
  owner_note?: string | null;
  note?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  customer?: { phone?: string | null; email?: string | null } | null;
};

/** Pedidos pagados en la tienda en el mes (hora argentina, UTC-3), sin los cancelados. null si no está conectada. */
export async function storeSalesForMonth(month: string): Promise<StoreSales | null> {
  if (!isConnected()) return null;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const min = `${month}T00:00:00-03:00`;
  const max = new Date(new Date(`${next}T00:00:00-03:00`).getTime() - 1000).toISOString();

  const off: TnSale[] = [];
  const byOrigin: Record<string, { total: number; ventas: number }> = {};
  try {
    for (let page = 1; page <= 50; page++) {
      const url = new URL(`${API}/${tiendanube.storeId}/orders`);
      url.search = new URLSearchParams({
        created_at_min: min,
        created_at_max: max,
        payment_status: "paid",
        status: "any",
        per_page: "200",
        page: String(page),
        fields: "id,number,total,status,payment_status,storefront,owner_note,note,contact_phone,contact_email,customer",
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
      for (const o of orders) {
        if (o.status === "cancelled" || o.payment_status !== "paid") continue;
        const origin = o.storefront || "desconocido";
        const total = Number(o.total) || 0;
        const b = (byOrigin[origin] ??= { total: 0, ventas: 0 });
        b.total += total;
        b.ventas += 1;
        if (!OFF_ORIGINS.includes(origin)) continue;
        off.push({
          id: o.id,
          number: o.number ?? null,
          total,
          origin,
          phone: o.contact_phone || o.customer?.phone || null,
          email: (o.contact_email || o.customer?.email || null)?.toLowerCase() ?? null,
          note: [o.owner_note, o.note].filter(Boolean).join(" "),
        });
      }
      if (orders.length < 200) break;
    }
  } catch {
    return { ok: false, error: "No se pudo conectar con Tiendanube" };
  }
  return { ok: true, off, byOrigin };
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
