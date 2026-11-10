"use client";

// Locales: copiar los objetivos del mes anterior al mes que se está viendo (solo admin; no pisa los ya cargados).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copyLocalGoals } from "@/app/actions";

export function CopyLocalGoals({ fromMonth, toMonth, fromLabel }: { fromMonth: string; toMonth: string; fromLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await copyLocalGoals(fromMonth, toMonth);
          setBusy(false);
          if (!r.ok) return setMsg(r.error);
          setMsg(r.data?.copied ? `Listo: ${r.data.copied} objetivos copiados.` : "No había objetivos nuevos para copiar.");
          router.refresh();
        }}
        className="btn-secondary py-1.5"
      >
        {busy ? "Copiando…" : `📋 Copiar los objetivos de ${fromLabel}`}
      </button>
      {msg && <span className="text-xs text-stone-500">{msg}</span>}
    </div>
  );
}
