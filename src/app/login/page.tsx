"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => setError(new URLSearchParams(window.location.search).has("error")), []);

  async function signIn() {
    setLoading(true);
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-6 p-8 text-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight">WAYFARER</h1>
          <p className="text-sm text-stone-500">CRM del equipo</p>
        </div>
        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">No se pudo entrar. Probá de nuevo.</p>}
        <button onClick={signIn} disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? "Entrando…" : "Entrar con Google"}
        </button>
      </div>
    </main>
  );
}
