import { describe, expect, it } from "vitest";
import { cleanKey, cleanUrl, looksLikeKey } from "./env";

describe("limpieza de variables de Supabase", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abc_DEF-123";
  it.each([
    [jwt, jwt],
    [` ${jwt}\n`, jwt],
    [` ${jwt}​`, jwt],
    [`"${jwt}"`, jwt],
    [`${jwt}…`, jwt],
  ])("cleanKey %j", (raw, out) => expect(cleanKey(raw)).toBe(out));

  it.each([
    ["https://abcd.supabase.co", "https://abcd.supabase.co"],
    [" https://abcd.supabase.co/ ", "https://abcd.supabase.co"],
    ["https://abcd.supabase.co/rest/v1/", "https://abcd.supabase.co"],
    [" https://abcd.supabase.co​", "https://abcd.supabase.co"],
  ])("cleanUrl %j", (raw, out) => expect(cleanUrl(raw)).toBe(out));

  it("reconoce claves válidas", () => {
    expect(looksLikeKey(jwt)).toBe(true);
    expect(looksLikeKey("sb_publishable_AbC123")).toBe(true);
    expect(looksLikeKey("cualquiercosa")).toBe(false);
    expect(looksLikeKey("")).toBe(false);
  });
});
