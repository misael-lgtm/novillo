"use server";

import { revalidatePath } from "next/cache";
import {
  BANK_PROMO_IDS,
  CARRIER_IDS,
  CHANNEL_IDS,
  FIRST_STAGE,
  PAYMENT_METHOD_IDS,
  SOLD_STAGE,
  STAGES,
  STAGE_IDS,
  type StageId,
} from "@/lib/config";
import {
  FIELD_LABELS,
  addDays,
  missingForStage,
  normalizeInstagram,
  normalizePhoneAR,
  parseMoney,
  todayAR,
  type OrderFields,
  type RequiredField,
} from "@/lib/rules";
import { TEAM_SCOPE } from "@/lib/goals";
import { FINAL_PAGE, ORDER_SELECT } from "@/lib/queries";
import { requireMember } from "@/lib/session";
import type { ActionResult, Customer, Order, OrderWithCustomer } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

type PgError = { code?: string; message?: string } | null;

/** Traduce errores de la base a algo que se entienda. */
function friendly(error: PgError): string {
  const msg = error?.message ?? "";
  if (error?.code === "23505") {
    if (msg.includes("instagram")) return "Ya hay un cliente con ese Instagram.";
    if (msg.includes("phone")) return "Ya hay un cliente con ese celular.";
    if (msg.includes("team_members")) return "Esa persona ya está en el equipo.";
    return "Eso ya existe.";
  }
  if (msg.includes("orders_total_required")) return "Falta el monto total.";
  if (msg.includes("orders_payment_required")) return "Falta el medio de pago.";
  if (msg.includes("orders_address_required")) return "Falta la dirección de envío.";
  if (msg.includes("orders_shipping_required")) return "Falta el correo o el número de seguimiento.";
  if (msg.includes("orders_cancel_reason_required")) return "Falta el motivo de cancelación.";
  if (msg.includes("no se borra")) return "En el CRM no se borra nada: usá Archivar.";
  if (msg.includes("row-level security")) return "No tenés permiso para hacer eso.";
  console.error("Error de base no mapeado:", error);
  return "Algo salió mal al guardar. Probá de nuevo y si sigue, avisá.";
}

function missingError(missing: RequiredField[]): ActionResult<never> {
  return {
    ok: false,
    error: "Faltan datos: " + missing.map((f) => FIELD_LABELS[f]).join(", ") + ".",
    fields: Object.fromEntries(missing.map((f) => [f, "Obligatorio"])),
  };
}

function refresh() {
  revalidatePath("/", "layout");
}

/** Lee los campos de pedido que vengan en el form (solo los presentes). */
function readOrderFields(fd: FormData): { patch: Partial<OrderFields>; fields: Record<string, string> } {
  const patch: Partial<OrderFields> = {};
  const fields: Record<string, string> = {};

  if (fd.has("total")) {
    const raw = str(fd, "total");
    const total = parseMoney(raw);
    if (raw && total == null) fields.total = "Monto inválido. Escribilo así: 45000 o 45.000";
    patch.total = total;
  }
  if (fd.has("payment_method")) patch.payment_method = oneOf(str(fd, "payment_method"), PAYMENT_METHOD_IDS);
  if (fd.has("bank_promo")) patch.bank_promo = oneOf(str(fd, "bank_promo"), BANK_PROMO_IDS);
  if (fd.has("carrier")) patch.carrier = oneOf(str(fd, "carrier"), CARRIER_IDS);
  if (fd.has("shipping_address")) patch.shipping_address = str(fd, "shipping_address");
  if (fd.has("tracking_code")) patch.tracking_code = str(fd, "tracking_code")?.toUpperCase() ?? null;
  if (fd.has("cancel_reason")) patch.cancel_reason = str(fd, "cancel_reason");
  return { patch, fields };
}

async function createFollowUp(orderId: string, orderNumber: number, stage: StageId, assignee: string) {
  await createFollowUps([{ id: orderId, number: orderNumber, assigned_to: assignee }], stage);
}

/** Igual que createFollowUp pero para varios pedidos a la vez (mover una lista entera). */
async function createFollowUps(orders: { id: string; number: number; assigned_to: string }[], stage: StageId) {
  if (!orders.length) return;
  const { supabase } = await requireMember();
  // Cerrar las tareas automáticas de la etapa anterior: ya no aplican.
  await supabase
    .from("tasks")
    .update({ done_at: new Date().toISOString() })
    .in("order_id", orders.map((o) => o.id))
    .not("auto_stage", "is", null)
    .is("done_at", null);

  const followUp = STAGES.find((s) => s.id === stage)?.followUp;
  if (!followUp) return;
  await supabase.from("tasks").insert(
    orders.map((o) => ({
      title: `${followUp.title} (#${o.number})`,
      due_date: addDays(todayAR(), followUp.inDays),
      assigned_to: o.assigned_to,
      order_id: o.id,
      auto_stage: stage,
    })),
  );
}

// ── Clientes ─────────────────────────────────────────────────

export async function searchCustomers(q: string): Promise<Customer[]> {
  const { supabase } = await requireMember();
  const term = q.trim();
  if (term.length < 2) return [];

  // Comillas para que PostgREST no interprete comas/puntos del texto como sintaxis.
  const ors = [`name.ilike."%${term.replace(/["\\%,()]/g, "")}%"`];
  const ig = normalizeInstagram(term);
  if (ig) ors.push(`instagram.ilike."%${ig}%"`);
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 6) ors.push(`phone.like."%${digits.slice(-8)}%"`);

  const { data } = await supabase
    .from("customers")
    .select("*")
    .or(ors.join(","))
    .is("archived_at", null)
    .order("name")
    .limit(8)
    .returns<Customer[]>();
  return data ?? [];
}

type CustomerInput = { name: string | null; instagram: string | null; phone: string | null; email?: string | null };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function validateCustomer(fd: FormData, prefix = ""): { input: CustomerInput; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const name = str(fd, prefix + "name");
  const rawIg = str(fd, prefix + "instagram");
  const rawPhone = str(fd, prefix + "phone");
  const instagram = normalizeInstagram(rawIg);
  const phone = normalizePhoneAR(rawPhone);

  if (!name || name.length < 2) fields[prefix + "name"] = "Poné el nombre";
  if (rawIg && !instagram) fields[prefix + "instagram"] = "Usuario de IG inválido (solo letras, números, . y _)";
  if (rawPhone && !phone) fields[prefix + "phone"] = "Celular inválido. Ej: 11 2345 6789";
  if (!rawIg && !rawPhone) fields[prefix + "instagram"] = "Poné el Instagram o el celular (al menos uno)";
  return { input: { name, instagram, phone }, fields };
}

/** Busca un cliente existente por IG o celular; si no existe lo crea. */
async function findOrCreateCustomer(input: CustomerInput): Promise<ActionResult<{ id: string; existed: boolean }>> {
  const { supabase } = await requireMember();
  const ors: string[] = [];
  if (input.instagram) ors.push(`instagram.eq."${input.instagram}"`);
  if (input.phone) ors.push(`phone.eq."${input.phone}"`);

  const { data: existing } = await supabase
    .from("customers")
    .select("id, archived_at")
    .or(ors.join(","))
    .limit(1)
    .maybeSingle<{ id: string; archived_at: string | null }>();
  if (existing) {
    if (existing.archived_at) await supabase.from("customers").update({ archived_at: null }).eq("id", existing.id);
    // Si ya existía sin mail, le queda el que se cargó ahora.
    if (input.email) await supabase.from("customers").update({ email: input.email }).eq("id", existing.id).is("email", null);
    return { ok: true, data: { id: existing.id, existed: true } };
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ name: input.name, instagram: input.instagram, phone: input.phone, email: input.email ?? null })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: friendly(error) };
  return { ok: true, data: { id: data.id, existed: false } };
}

export async function updateCustomer(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { input, fields } = validateCustomer(fd);
  const rawEmail = str(fd, "email");
  const email = rawEmail?.toLowerCase() ?? null;
  if (email && !EMAIL_RE.test(email)) fields.email = "Email inválido";
  if (Object.keys(fields).length) return { ok: false, error: "Revisá los campos marcados.", fields };

  const { error } = await supabase
    .from("customers")
    .update({ ...input, email, city: str(fd, "city"), notes: str(fd, "notes") })
    .eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true, message: "Cliente guardado ✔" };
}

export async function setCustomerArchived(id: string, archived: boolean): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { error } = await supabase
    .from("customers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true };
}

// ── Pedidos ──────────────────────────────────────────────────

export async function createOrder(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const { supabase, me } = await requireMember();
  const fields: Record<string, string> = {};

  let customerId = str(fd, "customer_id");
  let customerInput: CustomerInput | null = null;
  if (!customerId) {
    const v = validateCustomer(fd, "new_");
    Object.assign(fields, v.fields);
    // El mail se pide pero es opcional; si lo ponen, tiene que estar bien escrito.
    const email = str(fd, "new_email")?.toLowerCase() ?? null;
    if (email && !EMAIL_RE.test(email)) fields.new_email = "Mail inválido. Ej: juana@gmail.com";
    customerInput = { ...v.input, email };
  }

  const channel = oneOf(str(fd, "channel"), CHANNEL_IDS);
  if (!channel) fields.channel = "Elegí por dónde llegó";

  const description = str(fd, "description");
  if (!description || description.length < 3) fields.description = "Contá qué quiere (prenda, talle, color)";

  const stage = oneOf(str(fd, "stage"), ["primer_contacto", "interesado", "esperando_pago"] as const) ?? FIRST_STAGE;
  const { patch, fields: moneyErrors } = readOrderFields(fd);
  Object.assign(fields, moneyErrors);
  if (stage === "esperando_pago" && !patch.total && !fields.total) fields.total = "Para esperar el pago necesitamos el monto";

  const assignedTo = str(fd, "assigned_to") ?? me.email;

  if (Object.keys(fields).length) return { ok: false, error: "Revisá los campos marcados.", fields };

  let existed = false;
  if (!customerId && customerInput) {
    const res = await findOrCreateCustomer(customerInput);
    if (!res.ok) return res;
    customerId = res.data!.id;
    existed = res.data!.existed;
  }

  const { data, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId,
      channel,
      description,
      stage,
      total: patch.total ?? null,
      assigned_to: assignedTo,
    })
    .select("id, number")
    .single<{ id: string; number: number }>();
  if (error || !data) return { ok: false, error: friendly(error) };

  await createFollowUp(data.id, data.number, stage, assignedTo);
  refresh();
  return {
    ok: true,
    data: { id: data.id },
    message: existed
      ? `Pedido #${data.number} creado ✔ (el cliente ya existía, se lo asignamos)`
      : `Pedido #${data.number} creado ✔`,
  };
}

/**
 * Cambio de talle/prenda: crea un pedido nuevo vinculado al original.
 * Sin diferencia a pagar → arranca en "Compró" (listo para despachar).
 * Con diferencia → arranca en "Esperando pago".
 */
export async function createExchange(orderId: string, _prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const { supabase, me } = await requireMember();
  const { data: original } = await supabase.from("orders").select("*").eq("id", orderId).single<Order>();
  if (!original) return { ok: false, error: "No encontré el pedido original." };
  if (original.kind === "cambio") return { ok: false, error: "Pedí el cambio desde el pedido original." };

  const fields: Record<string, string> = {};
  const description = str(fd, "description");
  if (!description || description.length < 3) fields.description = "Contá qué devuelve y qué se lleva";
  const { patch, fields: moneyErrors } = readOrderFields(fd);
  Object.assign(fields, moneyErrors);
  const address = str(fd, "shipping_address") ?? original.shipping_address;
  if (!address) fields.shipping_address = "¿A dónde le mandamos la prenda nueva?";
  if (Object.keys(fields).length) return { ok: false, error: "Revisá los campos marcados.", fields };

  const total = patch.total ?? null;
  const stage: StageId = total ? "esperando_pago" : SOLD_STAGE;
  const { data, error } = await supabase
    .from("orders")
    .insert({
      customer_id: original.customer_id,
      channel: original.channel,
      kind: "cambio",
      parent_order_id: original.id,
      description,
      total,
      stage,
      shipping_address: address,
      assigned_to: original.assigned_to,
    })
    .select("id, number")
    .single<{ id: string; number: number }>();
  if (error || !data) return { ok: false, error: friendly(error) };

  await supabase.from("activity_log").insert({
    entity: "order",
    entity_id: original.id,
    order_id: original.id,
    kind: "note",
    message: `Pidió un cambio → pedido #${data.number}: ${description}`,
    actor: me.email,
  });
  await createFollowUp(data.id, data.number, stage, original.assigned_to);
  refresh();
  return { ok: true, data: { id: data.id }, message: `Cambio #${data.number} creado ✔` };
}

/** Mover de etapa. Si faltan datos para esa etapa, devuelve cuáles para pedirlos. */
export async function moveOrder(orderId: string, stage: string, fd?: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const target = oneOf(stage, STAGE_IDS);
  if (!target) return { ok: false, error: "Etapa inválida." };

  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single<Order>();
  if (!order) return { ok: false, error: "No encontré el pedido." };
  if (order.archived_at) return { ok: false, error: "El pedido está archivado. Restauralo primero." };
  if (order.stage === target) return { ok: true };

  const { patch, fields } = fd ? readOrderFields(fd) : { patch: {}, fields: {} };
  if (Object.keys(fields).length) return { ok: false, error: "Revisá los campos marcados.", fields };

  const merged: OrderFields = { ...order, ...patch };
  const missing = missingForStage(merged, target);
  if (missing.length) return missingError(missing);

  const { error } = await supabase.from("orders").update({ ...patch, stage: target }).eq("id", orderId);
  if (error) return { ok: false, error: friendly(error) };

  await createFollowUp(order.id, order.number, target, order.assigned_to);
  refresh();
  return { ok: true, message: `#${order.number} → ${STAGES.find((s) => s.id === target)!.label}` };
}

/** Partir listas largas: la API no acepta miles de ids en un solo pedido. */
function chunks<T>(xs: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * Mover varios pedidos juntos: los tildados en el tablero (`orderIds`) o una etapa entera (`fromStage`).
 * Los que no tienen los datos que pide la etapa no se mueven: se avisa cuáles quedaron.
 * Para "Sin causa" se puede mandar un motivo que se usa en los que no tienen uno.
 */
export async function moveOrders(
  from: { orderIds: string[] } | { fromStage: string },
  stage: string,
  cancelReason?: string,
): Promise<ActionResult<{ moved: string[] }>> {
  const { supabase } = await requireMember();
  const target = oneOf(stage, STAGE_IDS);
  if (!target) return { ok: false, error: "Etapa inválida." };
  const reason = cancelReason?.trim() || null;

  const orders: Order[] = [];
  if ("orderIds" in from) {
    if (!from.orderIds.length) return { ok: false, error: "No elegiste ningún pedido." };
    for (const ids of chunks(from.orderIds)) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("id", ids)
        .is("archived_at", null)
        .neq("stage", target)
        .returns<Order[]>();
      if (error) return { ok: false, error: friendly(error) };
      orders.push(...(data ?? []));
    }
  } else {
    const source = oneOf(from.fromStage, STAGE_IDS);
    if (!source) return { ok: false, error: "Etapa inválida." };
    if (source === target) return { ok: false, error: "Ya están en esa etapa." };
    // De a 1000 (es lo máximo que devuelve la API por vez).
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("stage", source)
        .is("archived_at", null)
        .order("id")
        .range(offset, offset + 999)
        .returns<Order[]>();
      if (error) return { ok: false, error: friendly(error) };
      orders.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    if (!orders.length) return { ok: false, error: "No hay pedidos en esa etapa." };
  }

  const ok: Order[] = [];
  const needReason: Order[] = [];
  const skipped: Order[] = [];
  for (const o of orders) {
    const lacksReason = target === "sin_causa" && !o.cancel_reason?.trim();
    if (missingForStage({ ...o, cancel_reason: lacksReason ? reason : o.cancel_reason }, target).length) skipped.push(o);
    else (lacksReason ? needReason : ok).push(o);
  }

  for (const part of chunks(ok)) {
    const { error } = await supabase.from("orders").update({ stage: target }).in("id", part.map((o) => o.id));
    if (error) return { ok: false, error: friendly(error) };
  }
  for (const part of chunks(needReason)) {
    const { error } = await supabase
      .from("orders")
      .update({ stage: target, cancel_reason: reason })
      .in("id", part.map((o) => o.id));
    if (error) return { ok: false, error: friendly(error) };
  }

  const moved = [...ok, ...needReason];
  for (const part of chunks(moved)) await createFollowUps(part, target);
  refresh();

  const label = STAGES.find((s) => s.id === target)!.label;
  let message = moved.length
    ? `${moved.length.toLocaleString("es-AR")} ${moved.length === 1 ? "pedido pasado" : "pedidos pasados"} a ${label} ✔`
    : `No se movió ninguno a ${label}`;
  if (skipped.length) {
    const nums = skipped.slice(0, 10).map((o) => `#${o.number}`).join(", ");
    message += `. ${skipped.length} no se movieron porque les faltan datos (${nums}${skipped.length > 10 ? "…" : ""}): abrilos y completalos.`;
  }
  return { ok: true, data: { moved: moved.map((o) => o.id) }, message };
}

/** "Ver más" en las columnas Compró / Sin causa del tablero. */
export async function loadMoreOrders(stage: string, offset: number): Promise<OrderWithCustomer[]> {
  const { supabase } = await requireMember();
  const target = oneOf(stage, STAGE_IDS);
  if (!target || !Number.isInteger(offset) || offset < 0) return [];
  const { data } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .is("archived_at", null)
    .eq("stage", target)
    .order("stage_changed_at", { ascending: false })
    .range(offset, offset + FINAL_PAGE - 1)
    .returns<OrderWithCustomer[]>();
  return data ?? [];
}

export async function updateOrder(orderId: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single<Order>();
  if (!order) return { ok: false, error: "No encontré el pedido." };

  const { patch, fields } = readOrderFields(fd);
  const description = str(fd, "description");
  if (!description || description.length < 3) fields.description = "Contá qué quiere (prenda, talle, color)";
  const channel = oneOf(str(fd, "channel"), CHANNEL_IDS);
  if (!channel) fields.channel = "Elegí un canal";
  const assignedTo = str(fd, "assigned_to");
  if (!assignedTo) fields.assigned_to = "Elegí un responsable";
  if (Object.keys(fields).length) return { ok: false, error: "Revisá los campos marcados.", fields };

  const missing = missingForStage({ ...order, ...patch }, order.stage);
  if (missing.length) {
    const r = missingError(missing);
    if (!r.ok) r.error = `En "${STAGES.find((s) => s.id === order.stage)!.label}" no puede faltar: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.`;
    return r;
  }

  const { error } = await supabase
    .from("orders")
    .update({ ...patch, description, channel, assigned_to: assignedTo })
    .eq("id", orderId);
  if (error) return { ok: false, error: friendly(error) };

  // Si cambió el responsable, las tareas abiertas del pedido pasan a la nueva persona.
  if (assignedTo !== order.assigned_to) {
    await supabase.from("tasks").update({ assigned_to: assignedTo }).eq("order_id", orderId).is("done_at", null);
  }
  refresh();
  return { ok: true, message: "Pedido guardado ✔" };
}

export async function setOrderArchived(orderId: string, archived: boolean): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { error } = await supabase
    .from("orders")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", orderId);
  if (error) return { ok: false, error: friendly(error) };
  if (archived) {
    await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("order_id", orderId).is("done_at", null);
  }
  refresh();
  return { ok: true };
}

/** Nota escrita desde la tarjeta del tablero. */
export async function addCardNote(orderId: string, message: string): Promise<ActionResult> {
  const fd = new FormData();
  fd.set("message", message);
  return addNote(orderId, null, fd);
}

export async function addNote(orderId: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, me } = await requireMember();
  const message = str(fd, "message");
  if (!message) return { ok: false, error: "Escribí algo.", fields: { message: "Vacío" } };
  const { error } = await supabase
    .from("activity_log")
    .insert({ entity: "order", entity_id: orderId, order_id: orderId, kind: "note", message, actor: me.email });
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true };
}

// ── Objetivos del mes ────────────────────────────────────────

/** El admin carga el objetivo del equipo y el de cada vendedor para un mes. Vacío = sin objetivo. */
export async function saveGoals(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, me } = await requireMember();
  if (!me.is_admin) return { ok: false, error: "Solo el admin carga objetivos." };
  const mes = str(fd, "month");
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return { ok: false, error: "Elegí el mes.", fields: { month: "Elegí el mes" } };
  const month = `${mes}-01`;

  const { data: team } = await supabase.from("team_members").select("email");
  const scopes = [TEAM_SCOPE, ...(team ?? []).map((m) => m.email as string)];
  const fields: Record<string, string> = {};
  const upserts: { month: string; scope: string; amount: number }[] = [];
  const clears: string[] = [];
  for (const scope of scopes) {
    const key = `goal:${scope}`;
    if (!fd.has(key)) continue;
    const raw = str(fd, key);
    if (!raw) {
      clears.push(scope);
      continue;
    }
    const amount = parseMoney(raw);
    if (!amount) fields[key] = "Monto inválido. Ej: 1.500.000";
    else upserts.push({ month, scope, amount });
  }
  if (Object.keys(fields).length) return { ok: false, error: "Revisá los montos marcados.", fields };

  if (upserts.length) {
    const { error } = await supabase
      .from("monthly_goals")
      .upsert(upserts.map((u) => ({ ...u, updated_by: me.email, updated_at: new Date().toISOString() })));
    if (error) return { ok: false, error: friendly(error) };
  }
  if (clears.length) {
    const { error } = await supabase.from("monthly_goals").delete().eq("month", month).in("scope", clears);
    if (error) return { ok: false, error: friendly(error) };
  }
  refresh();
  return { ok: true, message: "Objetivos guardados ✔" };
}

// ── Tareas ───────────────────────────────────────────────────

export async function createTask(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, me } = await requireMember();
  const fields: Record<string, string> = {};
  const title = str(fd, "title");
  if (!title || title.length < 3) fields.title = "¿Qué hay que hacer?";
  const due = str(fd, "due_date");
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) fields.due_date = "Elegí una fecha";
  else if (due < todayAR()) fields.due_date = "La fecha ya pasó";
  if (Object.keys(fields).length) return { ok: false, error: "Revisá los campos marcados.", fields };

  const { error } = await supabase.from("tasks").insert({
    title,
    due_date: due,
    assigned_to: str(fd, "assigned_to") ?? me.email,
    order_id: str(fd, "order_id"),
  });
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true, message: "Tarea creada ✔" };
}

export async function setTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { error } = await supabase
    .from("tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true };
}

export async function postponeTask(taskId: string, days: number): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { error } = await supabase
    .from("tasks")
    .update({ due_date: addDays(todayAR(), Math.max(1, Math.min(days, 30))) })
    .eq("id", taskId);
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true };
}

// ── Equipo (solo admin) ──────────────────────────────────────

export async function addMember(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, me } = await requireMember();
  if (!me.is_admin) return { ok: false, error: "Solo un admin puede sumar gente." };
  const name = str(fd, "name");
  const loginEmail = str(fd, "login_email")?.toLowerCase() ?? null;
  const fields: Record<string, string> = {};
  const validEmail = (v: string | null) => !!v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  if (!name || name.length < 2) fields.name = "Poné el nombre";

  let email: string | null;
  if (fd.get("shared") === "on") {
    // Casilla compartida: armamos un identificador propio para la persona (ventas+marian@...).
    if (!validEmail(loginEmail)) fields.login_email = "Poné la casilla compartida (ej. ventas@wayfarerarg.com)";
    const slug = (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
    if (name && !slug) fields.name = "Usá letras en el nombre";
    const [user, domain] = (loginEmail ?? "@").split("@");
    email = `${user}+${slug}@${domain}`;
  } else {
    email = str(fd, "email")?.toLowerCase() ?? null;
    if (!validEmail(email)) fields.email = "Email inválido (el mail con el que va a entrar)";
  }
  if (Object.keys(fields).length) return { ok: false, error: "Revisá los campos marcados.", fields };

  const { error } = await supabase.from("team_members").insert({
    email,
    name,
    login_email: fd.get("shared") === "on" ? loginEmail : null,
    is_admin: fd.get("is_admin") === "on",
  });
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true, message: `${name} ya puede entrar ✔` };
}

/** Cambiar la "fotito" (emoji) de alguien del equipo. Vacío = sin fotito. */
export async function setMemberAvatar(email: string, avatar: string): Promise<ActionResult> {
  const { supabase, me } = await requireMember();
  if (!me.is_admin) return { ok: false, error: "Solo un admin puede hacer esto." };
  const value = avatar.trim() || null;
  if (value && [...value].length > 8) return { ok: false, error: "Poné solo un emoji." };
  const { error } = await supabase.from("team_members").update({ avatar: value }).eq("email", email);
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true };
}

export async function setMemberActive(email: string, active: boolean): Promise<ActionResult> {
  const { supabase, me } = await requireMember();
  if (!me.is_admin) return { ok: false, error: "Solo un admin puede hacer esto." };
  if (email === me.email && !active) return { ok: false, error: "No te podés desactivar a vos mismo." };
  const { error } = await supabase.from("team_members").update({ active }).eq("email", email);
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true };
}
