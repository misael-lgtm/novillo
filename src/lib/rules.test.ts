import { describe, expect, it } from "vitest";
import {
  addDays,
  missingForStage,
  normalizeInstagram,
  normalizePhoneAR,
  parseMoney,
  todayAR,
  type OrderFields,
} from "./rules";

describe("normalizeInstagram", () => {
  it.each([
    ["@Juana.Perez ", "juana.perez"],
    ["juana_perez", "juana_perez"],
    ["https://www.instagram.com/juana.perez/", "juana.perez"],
    ["instagram.com/juana.perez?igsh=abc", "juana.perez"],
    ["@@juana", "juana"],
  ])("%s → %s", (input, out) => expect(normalizeInstagram(input)).toBe(out));

  it.each(["", "   ", "juana perez", "juana!", "a".repeat(31)])("rechaza %j", (input) =>
    expect(normalizeInstagram(input)).toBeNull(),
  );
});

describe("normalizePhoneAR", () => {
  it.each([
    ["11 2345-6789", "5491123456789"],
    ["011 15 2345 6789", "5491123456789"],
    ["+54 9 11 2345 6789", "5491123456789"],
    ["5491123456789", "5491123456789"],
    ["+54 11 2345 6789", "5491123456789"],
    ["0351 15 123 4567", "5493511234567"],
    ["(0221) 15-456-7890", "5492214567890"],
    ["2944 15 12 3456", "5492944123456"],
  ])("%s → %s", (input, out) => expect(normalizePhoneAR(input)).toBe(out));

  it.each(["", "1234", "abc", "11 2345 678"])("rechaza %j", (input) =>
    expect(normalizePhoneAR(input)).toBeNull(),
  );
});

describe("parseMoney", () => {
  it.each([
    ["12500", 12500],
    ["12.500", 12500],
    ["$ 12.500", 12500],
    ["1.250.000", 1250000],
    ["12500,50", 12500.5],
    ["12.500,5", 12500.5],
    ["12500.50", 12500.5],
  ])("%s → %d", (input, out) => expect(parseMoney(input)).toBe(out));

  it.each(["", "0", "-100", "doce mil", "12,500,00"])("rechaza %j", (input) =>
    expect(parseMoney(input)).toBeNull(),
  );
});

describe("missingForStage", () => {
  const empty: OrderFields = {
    total: null,
    payment_method: null,
    shipping_address: null,
    carrier: null,
    tracking_code: null,
    cancel_reason: null,
  };

  it("las etapas de seguimiento no piden nada", () => {
    for (const st of ["primer_contacto", "enviar_nuevamente", "interesado", "avanzado", "lista_de_espera", "mas_adelante", "hablar_de_nuevo"] as const)
      expect(missingForStage(empty, st)).toEqual([]);
  });

  it("esperando pago pide el monto", () => expect(missingForStage(empty, "esperando_pago")).toEqual(["total"]));

  it("compró pide monto y medio de pago", () =>
    expect(missingForStage(empty, "compro")).toEqual(["total", "payment_method"]));

  it("un cambio sin cargo puede pasar a compró sin monto ni pago", () =>
    expect(missingForStage({ ...empty, kind: "cambio" }, "compro")).toEqual([]));

  it("un cambio con diferencia a pagar pide medio de pago", () =>
    expect(missingForStage({ ...empty, kind: "cambio", total: 5000 }, "compro")).toEqual(["payment_method"]));

  it("no acepta opciones inventadas", () =>
    expect(missingForStage({ ...empty, total: 100, payment_method: "bitcoin" }, "compro")).toEqual(["payment_method"]));

  it("historial de ClickUp: exento solo en la etapa con la que llegó", () => {
    const imported = { ...empty, source: "clickup", source_stage: "compro" };
    expect(missingForStage(imported, "compro")).toEqual([]);
    expect(missingForStage({ ...imported, source_stage: "interesado" }, "compro")).toEqual(["total", "payment_method"]);
    expect(missingForStage({ ...imported, source_stage: "esperando_pago" }, "esperando_pago")).toEqual([]);
  });

  it("sin causa pide motivo (y no acepta texto en blanco)", () => {
    expect(missingForStage(empty, "sin_causa")).toEqual(["cancel_reason"]);
    expect(missingForStage({ ...empty, cancel_reason: "  " }, "sin_causa")).toEqual(["cancel_reason"]);
  });
});

describe("fechas", () => {
  it("todayAR usa la hora de Argentina", () =>
    // 01:00 UTC del 1/10 son las 22:00 del 30/9 en Buenos Aires
    expect(todayAR(new Date("2026-10-01T01:00:00Z"))).toBe("2026-09-30"));

  it("addDays cruza meses", () => expect(addDays("2026-09-30", 2)).toBe("2026-10-02"));
});
