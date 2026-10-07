import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];

import { SUPABASE_ANON_KEY as SUPABASE_KEY, SUPABASE_URL, looksLikeKey } from "@/lib/supabase/env";

// Página de error clara cuando falta configurar algo (en vez del 500 genérico de Vercel).
function setupError(detail: string) {
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Falta configurar el CRM</title>
<body style="font-family:system-ui;max-width:560px;margin:15vh auto;padding:0 20px;line-height:1.5;color:#1c1917">
<h1 style="font-size:22px">Falta configurar el CRM</h1>
<p>${detail}</p>
<p style="color:#78716c;font-size:14px">En Vercel: proyecto → Settings → Environment Variables. Después: Deployments → ⋯ del último → Redeploy.</p>
</body></html>`;
  return new NextResponse(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function middleware(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return setupError(
      `Faltan las variables ${!SUPABASE_URL ? "<b>NEXT_PUBLIC_SUPABASE_URL</b> " : ""}${!SUPABASE_KEY ? "<b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b>" : ""} en Vercel.`,
    );
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL) && !SUPABASE_URL.startsWith("http://localhost")) {
    return setupError(
      `La variable <b>NEXT_PUBLIC_SUPABASE_URL</b> tiene que ser solo la dirección del proyecto, tipo <code>https://abcd.supabase.co</code> (sin <code>/rest/v1</code> ni espacios).`,
    );
  }
  if (!looksLikeKey(SUPABASE_KEY)) {
    return setupError(
      `La variable <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b> no parece una clave de Supabase. Volvé a copiarla de Supabase (Project Settings → API Keys → <i>anon public</i>) y pegala sola, sin texto alrededor.`,
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  let user = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    // Si Supabase no responde, tratamos al visitante como no logueado (va al login) en vez de romper la página.
  }

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // /conector/ es público: el instalador del conector de WhatsApp (sin claves) se baja desde el celu sin iniciar sesión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|conector/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
