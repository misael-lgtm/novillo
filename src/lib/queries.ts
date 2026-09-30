export const TASK_SELECT = "*, order:orders(id, number, customer:customers(name))";
export const ORDER_SELECT = "*, customer:customers(id, name, instagram, phone)";
