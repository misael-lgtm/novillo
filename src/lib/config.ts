// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DEL CRM
// Acá se cambian las etapas, canales, medios de pago y correos.
// Si agregás o sacás una opción, actualizá también los CHECK de
// supabase/migrations (buscá el mismo nombre en el .sql).
// ─────────────────────────────────────────────────────────────

export const STAGES = [
  {
    id: "consulta",
    label: "Consulta",
    color: "bg-slate-100 border-slate-300",
    help: "Alguien preguntó por DM. Todavía no confirmó.",
    // Tarea automática que se crea al entrar a esta etapa
    followUp: { title: "Responder / seguir la consulta", inDays: 1 },
  },
  {
    id: "esperando_pago",
    label: "Esperando pago",
    color: "bg-amber-50 border-amber-300",
    help: "Confirmó qué quiere. Le pasamos el alias / link de pago.",
    followUp: { title: "Chequear si pagó", inDays: 1 },
  },
  {
    id: "pagado",
    color: "bg-emerald-50 border-emerald-300",
    label: "Pagado",
    help: "La plata ya está. Hay que armar el paquete y despacharlo.",
    followUp: { title: "Armar y despachar", inDays: 1 },
  },
  {
    id: "enviado",
    label: "Enviado",
    color: "bg-indigo-50 border-indigo-300",
    help: "Ya se despachó. Tiene número de seguimiento.",
    followUp: { title: "Confirmar que le llegó", inDays: 5 },
  },
  {
    id: "entregado",
    label: "Entregado",
    color: "bg-green-100 border-green-400",
    help: "Le llegó. Listo.",
    followUp: null,
  },
  {
    id: "cancelado",
    label: "Cancelado / Perdido",
    color: "bg-rose-50 border-rose-300",
    help: "No compró o se canceló. Siempre con motivo.",
    followUp: null,
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as [StageId, ...StageId[]];

export const CHANNELS = [
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "tienda_online", label: "Tienda online" },
  { id: "otro", label: "Otro" },
] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];
export const CHANNEL_IDS = CHANNELS.map((c) => c.id) as [ChannelId, ...ChannelId[]];

export const PAYMENT_METHODS = [
  { id: "transferencia", label: "Transferencia" },
  { id: "mercado_pago", label: "Mercado Pago" },
] as const;
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
export const PAYMENT_METHOD_IDS = PAYMENT_METHODS.map((p) => p.id) as [
  PaymentMethodId,
  ...PaymentMethodId[],
];

export const CARRIERS = [
  { id: "correo_argentino", label: "Correo Argentino", trackingUrl: "https://www.correoargentino.com.ar/formularios/e-commerce?id=" },
  { id: "andreani", label: "Andreani", trackingUrl: "https://www.andreani.com/#!/informacionEnvio/" },
  { id: "oca", label: "OCA", trackingUrl: "https://www.oca.com.ar/Busquedas/Envios?numero=" },
] as const;
export type CarrierId = (typeof CARRIERS)[number]["id"];
export const CARRIER_IDS = CARRIERS.map((c) => c.id) as [CarrierId, ...CarrierId[]];

export function stageLabel(id: string) {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}
export function channelLabel(id: string) {
  return CHANNELS.find((c) => c.id === id)?.label ?? id;
}
export function paymentLabel(id: string | null) {
  return PAYMENT_METHODS.find((p) => p.id === id)?.label ?? "—";
}
export function carrierLabel(id: string | null) {
  return CARRIERS.find((c) => c.id === id)?.label ?? "—";
}
export function trackingLink(carrier: string | null, code: string | null) {
  const c = CARRIERS.find((x) => x.id === carrier);
  return c && code ? c.trackingUrl + encodeURIComponent(code) : null;
}
