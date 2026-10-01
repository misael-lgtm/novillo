"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Login con mail + contraseña. Los usuarios los crea el admin en Supabase
// (Authentication → Users → Add user), así no depende de mandar mails.
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError("Revisá el mail, parece que está mal escrito.");
      return;
    }
    if (!password) {
      setError("Poné la contraseña.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await createClient().auth.signInWithPassword({ email: clean, password });
    if (error) {
      setLoading(false);
      if (error.code === "invalid_credentials" || error.status === 400) {
        setError("Mail o contraseña incorrectos. Fijate mayúsculas y que no haya espacios.");
      } else if (/api key/i.test(error.message)) {
        setError("La clave de Supabase cargada en Vercel no es la correcta. Avisale a Misael.");
      } else if (error.status === 429) {
        setError("Muchos intentos seguidos. Esperá un minuto y probá de nuevo.");
      } else {
        setError(`No pudimos entrar (${error.message}). Probá de nuevo en un rato.`);
      }
      return;
    }
    // Recarga completa para que el servidor vea la sesión nueva.
    window.location.assign("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight">WAYFARER</h1>
          <p className="text-sm text-stone-500">CRM del equipo</p>
        </div>

        <form onSubmit={signIn} className="space-y-3" noValidate>
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-stone-700">
              Mail
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="ventas@wayfarerarg.com"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-stone-700">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-16"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-2 my-auto h-8 rounded px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100"
              >
                {show ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <p className="text-center text-xs text-stone-500">¿No tenés contraseña? Pedísela a Misael.</p>
      </div>
    </main>
  );
}
