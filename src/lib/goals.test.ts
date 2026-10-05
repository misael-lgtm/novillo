import { describe, expect, it } from "vitest";
import { pace, type GoalLine } from "./goals";

const line = (goal: number | null, total: number): GoalLine => ({ scope: "x", name: "X", goal, total, ventas: 0 });

describe("pace", () => {
  // Octubre: 31 días. Objetivo 31.000.000 → 1.000.000 por día. Al día 10 (hoy incluido) "deberían" llevar 10.000.000.
  it("verde si van igual o arriba", () => {
    expect(pace(line(31_000_000, 10_000_000), "2026-10-10")?.status).toBe("ok");
    expect(pace(line(31_000_000, 12_000_000), "2026-10-10")?.status).toBe("ok");
  });
  it("amarillo si van hasta 20% abajo", () => {
    expect(pace(line(31_000_000, 9_000_000), "2026-10-10")?.status).toBe("warn");
    expect(pace(line(31_000_000, 8_000_000), "2026-10-10")?.status).toBe("warn");
  });
  it("rojo si van más de 20% abajo", () => {
    expect(pace(line(31_000_000, 7_900_000), "2026-10-10")?.status).toBe("bad");
    expect(pace(line(31_000_000, 0), "2026-10-01")?.status).toBe("bad");
  });
  it("calcula el promedio por día y lo necesario", () => {
    const p = pace(line(31_000_000, 9_000_000), "2026-10-10")!;
    expect(p.needPerDay).toBe(1_000_000);
    expect(p.perDay).toBe(900_000);
  });
  it("sin objetivo no hay ritmo", () => expect(pace(line(null, 5), "2026-10-10")).toBeNull());
});
