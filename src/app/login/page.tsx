"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// El botón de Google aparece solo si se configuró (ver README). El link por mail anda siempre.
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "true";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error")) {
      setError("El link venció o ya se usó. Pedí uno nuevo.");
    }
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError("Revisá el mail, parece que está mal escrito.");
      return;
    }
    setError(null);
    setStatus("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("idle");
      setError(
        error.status === 429
          ? "Se pidieron muchos links seguidos. Esperá unos minutos y probá de nuevo."
          : "No pudimos mandar el mail. Probá de nuevo en un rato.",
      );
      return;
    }
    setStatus("sent");
  }

  async function google() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight">WAYFARER</h1>
          <p className="text-sm text-stone-500">CRM del equipo</p>
        </div>

        {status === "sent" ? (
          <div className="space-y-3 text-center">
            <p className="text-4xl">📬</p>
            <p className="font-semibold">Te mandamos un mail a {email.trim().toLowerCase()}</p>
            <p className="text-sm text-stone-600">
              Abrilo <b>desde esta misma compu</b> y tocá el link. Si no lo ves, fijate en Spam o Promociones.
            </p>
            <button onClick={() => setStatus("idle")} className="text-sm text-stone-500 underline">
              Usar otro mail
            </button>
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <label htmlFor="email" className="block text-sm font-medium text-stone-700">
              Tu mail
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="nombre@gmail.com"
              aria-invalid={!!error}
              autoFocus
            />
            <button type="submit" disabled={status === "sending"} className="btn-primary w-full py-3 text-base">
              {status === "sending" ? "Mandando…" : "Mandarme el link para entrar"}
            </button>
            <p className="text-xs text-stone-500">Sin contraseña: te llega un link al mail y con eso entrás.</p>
          </form>
        )}

        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

        {GOOGLE_ENABLED && status !== "sent" && (
          <>
            <div className="flex items-center gap-3 text-xs text-stone-400">
              <span className="h-px flex-1 bg-stone-200" /> o <span className="h-px flex-1 bg-stone-200" />
            </div>
            <button onClick={google} className="btn-secondary w-full py-3 text-base">
              Entrar con Google
            </button>
          </>
        )}
      </div>
    </main>
  );
}
