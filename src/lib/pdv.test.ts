import { describe, expect, it } from "vitest";
import { splitConjunto } from "./pdv";

describe("splitConjunto", () => {
  it("separa camisa y bermuda", () => {
    expect(splitConjunto("Camisa Ladrillo + Bermuda Negra")).toEqual(["Ladrillo", "Negra"]);
    expect(splitConjunto("Camisa Lines Jet Black + Bermuda Off White")).toEqual(["Lines Jet Black", "Off White"]);
    expect(splitConjunto("Camisa Lines Navy + Bermuda Negro")).toEqual(["Lines Navy", "Negra"]);
  });
  it("todo de un color", () => {
    expect(splitConjunto("Todo Negro")).toEqual(["Negro", "Negra"]);
    expect(splitConjunto("Todo Off White")).toEqual(["Off White", "Off White"]);
  });
  it("lo raro no lo toca", () => expect(splitConjunto("Otra cosa")).toBeNull());
});
