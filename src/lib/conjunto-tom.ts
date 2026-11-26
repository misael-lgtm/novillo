// Conjunto Camisa de Lino + Pantalón Tom, armado igual que "Conjunto Lino | Camisa & Bermuda": Combinación + Talle.

export const CONJUNTO_TOM = {
  name: "Conjunto Lino | Camisa & Pantalón Tom",
  price: "187990.00", // 20% menos que camisa ($109.990) + Tom ($124.990), redondeado a 990
  camisas: ["Negro", "Off White", "Ladrillo", "Beige", "Verde", "Tostado", "Habano", "Lines Jet Black", "Lines Beige", "Lines Navy"],
  pantalones: ["Negro", "Verde", "Camel", "Crudo", "Chocolate"],
  talles: ["S", "M", "L", "XL", "XXL"],
};

const code = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** "Camisa Ladrillo + Pantalón Negro", o "Todo Negro" si las dos prendas son del mismo color. */
export function comboName(camisa: string, pantalon: string) {
  return camisa === pantalon ? `Todo ${camisa}` : `Camisa ${camisa} + Pantalón ${pantalon}`;
}

export function conjuntoTomVariants() {
  const { camisas, pantalones, talles, price } = CONJUNTO_TOM;
  return camisas.flatMap((c) =>
    pantalones.flatMap((p) =>
      talles.map((t) => ({
        values: [{ es: comboName(c, p) }, { es: t }],
        price,
        stock: 0,
        sku: `CONJ-TOM-${code(c)}-${code(p)}-${t}`,
      })),
    ),
  );
}
