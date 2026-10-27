"use client";

// Vuelve a pedir los datos de la página cada tanto mientras está a la vista (ej. Locales: las ventas se guardan cada minuto).
// No refresca si alguien está escribiendo en un campo, para no molestar.

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { onLive } from "@/lib/live";

export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    // Cuando se guardan ventas nuevas (aviso en vivo de la base) y, por las dudas, cada `seconds`.
    return onLive(
      ["live_ping"],
      () => {
        const el = document.activeElement;
        const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
        if (!typing) router.refresh();
      },
      seconds * 1000,
      60_000,
    );
  }, [router, seconds]);
  return null;
}
