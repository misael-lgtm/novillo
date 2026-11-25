// Ayudas para ordenar packs y conjuntos de Tiendanube y que se elijan fácil en el punto de venta.

/** "Camisa Ladrillo + Bermuda Negra" → ["Ladrillo", "Negra"]; "Todo Negro" → ["Negro", "Negra"]. */
export function splitConjunto(combo: string): [string, string] | null {
  const bermuda = (c: string) => c.replace(/^Negro$/i, "Negra");
  const todo = combo.match(/^Todo\s+(.+)$/i);
  if (todo) return [todo[1].trim(), bermuda(todo[1].trim())];
  const m = combo.match(/^Camisa\s+(.+?)\s*\+\s*Bermuda\s+(.+)$/i);
  return m ? [m[1].trim(), bermuda(m[2].trim())] : null;
}
