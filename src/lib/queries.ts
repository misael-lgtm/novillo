export const TASK_SELECT = "*, order:orders(id, number, customer:customers(name))";
export const ORDER_SELECT = "*, customer:customers(id, name, instagram, phone)";
/** Cuántas tarjetas de Compró / Sin causa trae el tablero por vez. */
export const FINAL_PAGE = 50;
