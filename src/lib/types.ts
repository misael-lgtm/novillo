import type { ChannelId, StageId } from "./config";

export type TeamMember = {
  email: string;
  name: string;
  /** Casilla compartida con la que entra (ej. ventas@). null = entra con su propio mail. */
  login_email: string | null;
  is_admin: boolean;
  active: boolean;
};

export type Customer = {
  id: string;
  name: string;
  instagram: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
};

export type Order = {
  id: string;
  number: number;
  customer_id: string;
  channel: ChannelId;
  stage: StageId;
  kind: "venta" | "cambio";
  parent_order_id: string | null;
  description: string;
  total: number | null;
  payment_method: string | null;
  shipping_address: string | null;
  carrier: string | null;
  tracking_code: string | null;
  cancel_reason: string | null;
  assigned_to: string;
  created_by: string;
  created_at: string;
  stage_changed_at: string;
  archived_at: string | null;
};

export type OrderWithCustomer = Order & {
  customer: Pick<Customer, "id" | "name" | "instagram" | "phone">;
};

export type Task = {
  id: string;
  title: string;
  due_date: string;
  assigned_to: string;
  order_id: string | null;
  customer_id: string | null;
  auto_stage: string | null;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
  archived_at: string | null;
};

export type TaskWithOrder = Task & {
  order: { id: string; number: number; customer: { name: string } | null } | null;
};

export type Activity = {
  id: number;
  entity: "order" | "customer" | "task";
  entity_id: string;
  order_id: string | null;
  kind: "created" | "updated" | "stage" | "archived" | "restored" | "done" | "reopened" | "note";
  message: string | null;
  changes: Record<string, unknown> | null;
  actor: string;
  created_at: string;
};

/** Resultado estándar de una acción: ok, o un mensaje claro para mostrar. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string> };
