import { describe, expect, it } from "vitest";
import { comboName, conjuntoTomVariants } from "./conjunto-tom";

describe("conjunto camisa + Tom", () => {
  it("nombra las combinaciones como el conjunto de lino", () => {
    expect(comboName("Ladrillo", "Negro")).toBe("Camisa Ladrillo + Pantalón Negro");
    expect(comboName("Negro", "Negro")).toBe("Todo Negro");
  });
  it("10 camisas × 5 pantalones × 5 talles, sin códigos repetidos", () => {
    const v = conjuntoTomVariants();
    expect(v).toHaveLength(250);
    expect(new Set(v.map((x) => x.sku)).size).toBe(250);
    expect(v.find((x) => x.sku === "CONJ-TOM-LINESJETBLACK-CHOCOLATE-XXL")?.values).toEqual([{ es: "Camisa Lines Jet Black + Pantalón Chocolate" }, { es: "XXL" }]);
    expect(v.every((x) => x.stock === 0 && x.price === "187990.00")).toBe(true);
  });
});
