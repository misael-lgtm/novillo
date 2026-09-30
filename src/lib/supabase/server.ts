import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cookie con la persona elegida en "¿Quién sos?" cuando varios comparten una casilla. */
export const AS_COOKIE = "crm_as";

export async function createClient() {
  const cookieStore = await cookies();
  const as = cookieStore.get(AS_COOKIE)?.value;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // La base valida que esa persona comparta la casilla del login (current_member()).
      global: as && /^[^\s@]+@[^\s@]+$/.test(as) ? { headers: { "x-crm-as": as } } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el middleware refresca la sesión.
          }
        },
      },
    },
  );
}
