// Reglas de negocio compartidas entre el navegador y el servidor.
// La base de datos repite las mismas reglas con CHECKs, así que aunque
// alguien saltee la interfaz no puede guardar un pedido incompleto.

import {
  CARRIER_IDS,
  PAYMENT_METHOD_IDS,
  type StageId,
} from "./config";

// ── Normalizadores ───────────────────────────────────────────

/** "@Juana.Perez ", "instagram.com/juana.perez/" → "juana.perez". null si no es válido. */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.replace(/^instagram\.com\//, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^@+/, "");
  if (!s) return null;
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}

/**
 * Normaliza un celular argentino al formato de WhatsApp: 549 + área + número (13 dígitos).
 * Acepta "11 2345-6789", "011 15 2345 6789", "+54 9 11 2345 6789", "5491123456789".
 * Devuelve null si no se puede interpretar.
 */
export function normalizePhoneAR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  // Sacar el "15" que va después del código de área (área de 2 a 4 dígitos)
  if (d.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (d.slice(areaLen, areaLen + 2) === "15") {
        d = d.slice(0, areaLen) + d.slice(areaLen + 2);
        break;
      }
    }
  }
  if (d.length !== 10) return null;
  return "549" + d;
}

/** "5491123456789" → "+54 9 11 2345-6789" (asume área 11 si empieza con 11; si no, genérico). */
export function formatPhone(p: string | null): string {
  if (!p) return "—";
  const local = p.replace(/^549/, "");
  if (local.startsWith("11")) return `+54 9 11 ${local.slice(2, 6)}-${local.slice(6)}`;
  return `+54 9 ${local.slice(0, 3)} ${local.slice(3)}`;
}

/** Montos como los escribe la gente: "$ 12.500", "12500,50", "12.500,5", "12500". */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/[$\s]/g, "").replace(/ars/i, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatMoney(n: number | null): string {
  if (n == null) return "—";
  return "$ " + n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

// ── Requisitos por etapa ─────────────────────────────────────

export type OrderFields = {
  /** "cambio" = cambio de talle/prenda: puede ser sin cargo (sin monto ni pago). */
  kind?: "venta" | "cambio";
  /** Historial importado de ClickUp: sin datos de pago/envío en la etapa con la que llegó. */
  source?: string | null;
  source_stage?: string | null;
  total: number | null;
  payment_method: string | null;
  shipping_address: string | null;
  carrier: string | null;
  tracking_code: string | null;
  cancel_reason: string | null;
};

export type RequiredField = Exclude<keyof OrderFields, "kind" | "source" | "source_stage">;

export const FIELD_LABELS: Record<RequiredField, string> = {
  total: "Monto total",
  payment_method: "Medio de pago",
  shipping_address: "Dirección de envío",
  carrier: "Correo",
  tracking_code: "Número de seguimiento",
  cancel_reason: "Motivo de cancelación",
};

const PAID: RequiredField[] = ["total", "payment_method", "shipping_address"];
const SHIPPED: RequiredField[] = [...PAID, "carrier", "tracking_code"];

export const STAGE_REQUIREMENTS: Record<StageId, RequiredField[]> = {
  consulta: [],
  esperando_pago: ["total"],
  pagado: PAID,
  enviado: SHIPPED,
  entregado: SHIPPED,
  cancelado: ["cancel_reason"],
};

function isFilled(field: RequiredField, v: OrderFields[RequiredField]): boolean {
  if (v == null) return false;
  if (field === "total") return typeof v === "number" && v > 0;
  if (field === "payment_method") return (PAYMENT_METHOD_IDS as readonly string[]).includes(v as string);
  if (field === "carrier") return (CARRIER_IDS as readonly string[]).includes(v as string);
  return String(v).trim().length > 0;
}

/** Qué campos faltan para poder poner el pedido en esa etapa. */
export function missingForStage(order: OrderFields, stage: StageId): RequiredField[] {
  // Un cambio sin cargo (sin monto) no necesita monto ni medio de pago.
  // Igual que en la base (0002_clickup_import.sql): exento solo mientras siga en la etapa importada.
  if (order.source === "clickup" && order.source_stage === stage && (stage === "entregado" || stage === "esperando_pago")) {
    return [];
  }
  const freeExchange = order.kind === "cambio" && order.total == null;
  return STAGE_REQUIREMENTS[stage].filter(
    (f) => !(freeExchange && (f === "total" || f === "payment_method")) && !isFilled(f, order[f]),
  );
}

// ── Fechas ───────────────────────────────────────────────────

/** Fecha de hoy (Argentina) en formato YYYY-MM-DD. */
export function todayAR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TZ = "America/Argentina/Buenos_Aires";

/** Fecha corta en hora argentina (igual en servidor y navegador). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { timeZone: TZ });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
}

/** "2026-10-05" → "lun, 5 oct" */
export function formatDayShort(isoDate: string): string {
  return new Date(isoDate + "T12:00:00Z").toLocaleDateString("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}
