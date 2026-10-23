"use client";

// Vuelve a pedir los datos de la página cada tanto mientras está a la vista (ej. Locales: las ventas se guardan cada minuto).
// No refresca si alguien está escribiendo en un campo, para no molestar.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (document.visibilityState === "visible" && !typing) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
