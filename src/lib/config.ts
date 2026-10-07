// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DEL CRM
// Acá se cambian las etapas, canales, medios de pago y correos.
// Si agregás o sacás una opción, actualizá también los CHECK de
// supabase/migrations (buscá el mismo nombre en el .sql).
// ─────────────────────────────────────────────────────────────

// Mismas etapas que tenía ClickUp ("CRM - Ventas - OFFLINE"), en el mismo orden.
// "cerrado" ahora se llama "Compró".
export const STAGES = [
  {
    id: "enviar_nuevamente",
    label: "Enviar nuevamente",
    color: "bg-stone-100 border-stone-300",
    help: "No contestó. Hay que volver a escribirle.",
    next: "interesado",
    followUp: { title: "Volver a escribirle", inDays: 2 },
  },
  {
    id: "primer_contacto",
    label: "Primer contacto",
    color: "bg-sky-50 border-sky-300",
    help: "Escribió por primera vez. Todavía no sabemos qué quiere.",
    next: "interesado",
    followUp: { title: "Responder la consulta", inDays: 1 },
  },
  {
    id: "interesado",
    label: "Interesado",
    color: "bg-violet-50 border-violet-300",
    help: "Le interesa un producto. Hay que acompañarlo.",
    next: "avanzado",
    followUp: { title: "Seguir al interesado", inDays: 2 },
  },
  {
    id: "avanzado",
    label: "Avanzado",
    color: "bg-lime-50 border-lime-400",
    help: "Ya eligió. Falta cerrar.",
    next: "esperando_pago",
    followUp: { title: "Cerrar la venta", inDays: 1 },
  },
  {
    id: "esperando_pago",
    label: "Esperando pago",
    color: "bg-amber-50 border-amber-300",
    help: "Confirmó. Le pasamos el alias o el link de pago.",
    next: "compro",
    followUp: { title: "Chequear si pagó", inDays: 1 },
  },
  {
    id: "promos_bancarias",
    label: "Promos bancarias",
    color: "bg-fuchsia-50 border-fuchsia-300",
    help: "Espera una promo del banco para comprar.",
    next: "interesado",
    followUp: { title: "Avisarle de la promo bancaria", inDays: 7 },
  },
  {
    id: "lista_de_espera",
    label: "Lista de espera",
    color: "bg-pink-50 border-pink-300",
    help: "Quiere algo que no hay. Avisarle cuando entre.",
    next: "interesado",
    followUp: { title: "Avisarle si entró el producto", inDays: 7 },
  },
  {
    id: "mas_adelante",
    label: "Más adelante",
    color: "bg-slate-100 border-slate-300",
    help: "Dijo que compra más adelante.",
    next: "interesado",
    followUp: { title: "Volver a contactar", inDays: 30 },
  },
  {
    id: "promo_del_finde",
    label: "Promo del finde",
    color: "bg-orange-50 border-orange-300",
    help: "Hay que mandarle la promo del fin de semana.",
    next: "interesado",
    followUp: { title: "Mandarle la promo del finde", inDays: 3 },
  },
  {
    id: "sin_causa",
    label: "Sin causa",
    color: "bg-rose-50 border-rose-300",
    help: "No compró. Siempre con motivo.",
    next: null,
    followUp: null,
  },
  {
    id: "hablar_de_nuevo",
    label: "Hablar de nuevo",
    color: "bg-teal-50 border-teal-300",
    help: "Retomar la charla más adelante.",
    next: "interesado",
    followUp: { title: "Hablar de nuevo", inDays: 7 },
  },
  {
    id: "compro",
    label: "Compró",
    color: "bg-green-100 border-green-400",
    help: "Venta cerrada: pagó.",
    next: null,
    followUp: null,
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as [StageId, ...StageId[]];

/** Etapa con la que arranca un pedido nuevo. */
export const FIRST_STAGE: StageId = "primer_contacto";
/** Venta concretada (habilita "Pedir cambio" y cuenta como comprado). */
export const SOLD_STAGE: StageId = "compro";
/** Perdido: pide motivo. */
export const LOST_STAGE: StageId = "sin_causa";
/** Etapas finales: tienen miles (historial), así que el tablero las trae de a poco ("Ver más"). */
export const FINAL_STAGES: readonly StageId[] = [SOLD_STAGE, LOST_STAGE];

/** Etapa sugerida para el botón "Pasar a…". */
export function nextStage(id: string) {
  const n = STAGES.find((s) => s.id === id)?.next;
  return n ? STAGES.find((s) => s.id === n)! : null;
}

// Nombres de las etapas viejas (aparecen en el historial de pedidos anteriores al cambio).
const LEGACY_STAGE_LABELS: Record<string, string> = {
  consulta: "Consulta",
  pagado: "Pagado",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

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

/** Los 3 teléfonos de WhatsApp Business de los locales (pestañas de "Teléfonos"). */
export const PHONE_LINES = [
  { id: "carritos", label: "Teléfono Carritos", short: "Carritos" },
  { id: "guemes", label: "Teléfono Güemes", short: "Güemes" },
  { id: "palermo", label: "Teléfono Palermo", short: "Palermo" },
] as const;
export type PhoneLineId = (typeof PHONE_LINES)[number]["id"];

/** Promo bancaria con la que pagó (opcional, se elige al pasar a Compró). */
export const BANK_PROMOS = [
  { id: "bna", label: "Promo BNA" },
  { id: "provincia", label: "Promo Provincia" },
  { id: "naranja", label: "Promo Naranja" },
  { id: "bbva", label: "Promo BBVA" },
  { id: "galicia", label: "Promo Galicia" },
] as const;
export type BankPromoId = (typeof BANK_PROMOS)[number]["id"];
export const BANK_PROMO_IDS = BANK_PROMOS.map((p) => p.id) as [BankPromoId, ...BankPromoId[]];

export const CARRIERS = [
  { id: "correo_argentino", label: "Correo Argentino", trackingUrl: "https://www.correoargentino.com.ar/formularios/e-commerce?id=" },
  { id: "andreani", label: "Andreani", trackingUrl: "https://www.andreani.com/#!/informacionEnvio/" },
  { id: "oca", label: "OCA", trackingUrl: "https://www.oca.com.ar/Busquedas/Envios?numero=" },
] as const;
export type CarrierId = (typeof CARRIERS)[number]["id"];
export const CARRIER_IDS = CARRIERS.map((c) => c.id) as [CarrierId, ...CarrierId[]];

export function stageLabel(id: string) {
  return STAGES.find((s) => s.id === id)?.label ?? LEGACY_STAGE_LABELS[id] ?? id;
}
export function channelLabel(id: string) {
  return CHANNELS.find((c) => c.id === id)?.label ?? id;
}
export function paymentLabel(id: string | null) {
  return PAYMENT_METHODS.find((p) => p.id === id)?.label ?? "—";
}
export function bankPromoLabel(id: string | null) {
  return BANK_PROMOS.find((p) => p.id === id)?.label ?? "Sin promo";
}
export function carrierLabel(id: string | null) {
  return CARRIERS.find((c) => c.id === id)?.label ?? "—";
}
export function trackingLink(carrier: string | null, code: string | null) {
  const c = CARRIERS.find((x) => x.id === carrier);
  return c && code ? c.trackingUrl + encodeURIComponent(code) : null;
}
