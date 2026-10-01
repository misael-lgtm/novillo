// Lee la configuración de Supabase de las variables de Vercel y la limpia:
// al copiar y pegar se suelen colar espacios raros, comillas o "…", que rompen los pedidos
// ("String contains non ISO-8859-1 code point").

/** Deja solo los caracteres que puede tener una clave de Supabase. */
export function cleanKey(raw: string | undefined): string {
  return (raw ?? "").replace(/[^A-Za-z0-9._-]/g, "");
}

/** "  https://abcd.supabase.co/rest/v1/ " → "https://abcd.supabase.co" */
export function cleanUrl(raw: string | undefined): string {
  return (raw ?? "")
    .replace(/[^\x21-\x7E]/g, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/+$/, "");
}

/** Clave con forma válida: JWT (3 partes) o clave publishable nueva. */
export function looksLikeKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key) || /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
}

export const SUPABASE_URL = cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = cleanKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
