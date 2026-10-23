import { describe, expect, it } from "vitest";
import { localOf } from "./tiendanube";

describe("localOf", () => {
  it("entiende las notas como las escriben los chicos", () => {
    expect(localOf("local/bruno/guemes/point mp")).toEqual({ local: "guemes", seller: "bruno" });
    expect(localOf("Local/Luana/Palermo/eft")).toEqual({ local: "palermo", seller: "Luana" });
    expect(localOf("Local/Palermo/Luana/Deb point mp")).toEqual({ local: "palermo", seller: "Luana" });
    expect(localOf("Local/Styven/Cambio/Palermo  #50974 deja Remera")).toEqual({ local: "palermo", seller: "Styven" });
    expect(localOf("Local/P/Cambio/Luana 47840 deja canterbury")).toEqual({ local: "palermo", seller: "Luana" });
    expect(localOf("locla/mariano/guemes")).toBeNull();
    expect(localOf("local/cambio/g deja grafton L")).toEqual({ local: "guemes", seller: null });
    expect(localOf("off/fabricio/wsp retira local mar del plata")).toBeNull();
    expect(localOf("")).toBeNull();
  });
});
