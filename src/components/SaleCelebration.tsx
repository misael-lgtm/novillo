"use client";

// Festejo en pantalla cuando entra una venta off nueva en Tiendanube: vuelan emojis (y el sticker del festejo, si cargaron uno)
// y aparece un cartel con el vendedor y el monto. Revisa cada minuto mientras el CRM está a la vista.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCelebrationImage, getOffSalesFeed, type OffSale } from "@/app/goal-actions";
import { formatMoney } from "@/lib/rules";

const POLL_MS = 60_000;
const SEEN_KEY = "crm_ventas_off_vistas";
const EMOJIS = ["💸", "🔥", "🎉", "🤑", "💰", "🥳", "🚀", "💙"];
const DURATION_MS = 5500;

type Seen = { month: string; ids: number[] };
function readSeen(): Seen | null {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null");
  } catch {
    return null;
  }
}
function writeSeen(s: Seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch {
    // sin almacenamiento: festeja de nuevo al recargar, no pasa nada
  }
}

type Party = { key: number; sale: OffSale; more: number };

export function SaleCelebration() {
  const router = useRouter();
  const [party, setParty] = useState<Party | null>(null);
  const image = useRef<string | null | undefined>(undefined);
  const seenMem = useRef<Seen | null>(null);

  const check = useCallback(async () => {
    const feed = await getOffSalesFeed().catch(() => null);
    if (!feed) return;
    const seen = readSeen() ?? seenMem.current;
    const ids = feed.sales.map((s) => s.id);
    const next = { month: feed.month, ids };
    seenMem.current = next;
    writeSeen(next);
    // La primera vez (o al cambiar de mes) solo se anotan: se festeja lo que entre de acá en adelante.
    if (!seen || seen.month !== feed.month) return;
    const fresh = feed.sales.filter((s) => !seen.ids.includes(s.id));
    if (!fresh.length) return;
    if (image.current === undefined) image.current = await getCelebrationImage().catch(() => null);
    const biggest = fresh.reduce((a, b) => (b.total > a.total ? b : a));
    setParty({ key: Date.now(), sale: biggest, more: fresh.length - 1 });
    router.refresh(); // que la barra del objetivo sume la venta
  }, [router]);

  useEffect(() => {
    check();
    const t = setInterval(() => document.visibilityState === "visible" && check(), POLL_MS);
    return () => clearInterval(t);
  }, [check]);

  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(null), DURATION_MS);
    return () => clearTimeout(t);
  }, [party]);

  if (!party) return null;
  return <Confetti key={party.key} party={party} image={image.current ?? null} onClose={() => setParty(null)} />;
}

function Confetti({ party, image, onClose }: { party: Party; image: string | null; onClose: () => void }) {
  // Posiciones al azar, fijas para este festejo.
  const [bits] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      emoji: EMOJIS[i % EMOJIS.length],
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      duration: 3 + Math.random() * 1.8,
      size: 26 + Math.random() * 30,
      drift: (Math.random() - 0.5) * 160,
    })),
  );
  const { sale, more } = party;
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-live="polite">
      <style>{`
        @keyframes venta-sube { 0% { transform: translate(0, 0) rotate(0deg); opacity: 0 } 10% { opacity: 1 } 85% { opacity: 1 }
          100% { transform: translate(var(--drift), -115vh) rotate(var(--spin)); opacity: 0 } }
        @keyframes venta-pop { 0% { transform: translate(-50%, 40px) scale(.3); opacity: 0 } 15% { transform: translate(-50%, 0) scale(1.08); opacity: 1 }
          22% { transform: translate(-50%, 0) scale(1) } 85% { opacity: 1; transform: translate(-50%, 0) scale(1) } 100% { opacity: 0; transform: translate(-50%, 20px) scale(.9) } }
        @keyframes venta-messi { 0% { transform: translateY(110%) rotate(-8deg) } 18% { transform: translateY(0) rotate(4deg) } 26% { transform: translateY(4%) rotate(-2deg) }
          34%, 82% { transform: translateY(0) rotate(0deg) } 100% { transform: translateY(115%) rotate(6deg) } }
        @media (prefers-reduced-motion: reduce) { .venta-bit, .venta-img { display: none } }
      `}</style>
      {bits.map((b, i) => (
        <span
          key={i}
          className="venta-bit absolute bottom-[-60px] select-none"
          style={
            {
              left: `${b.left}%`,
              fontSize: b.size,
              animation: `venta-sube ${b.duration}s ease-out ${b.delay}s both`,
              "--drift": `${b.drift}px`,
              "--spin": `${b.drift > 0 ? 40 : -40}deg`,
            } as React.CSSProperties
          }
        >
          {b.emoji}
        </span>
      ))}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="venta-img absolute bottom-0 right-[4vw] h-[min(55vh,420px)] w-auto drop-shadow-2xl"
          style={{ animation: `venta-messi ${DURATION_MS / 1000}s ease-in-out both` }}
        />
      )}
      <div
        className="pointer-events-auto absolute left-1/2 top-24 w-[min(92vw,26rem)] rounded-3xl bg-emerald-600 px-6 py-4 text-center text-white shadow-2xl"
        style={{ animation: `venta-pop ${DURATION_MS / 1000}s ease-out both` }}
        role="status"
      >
        <button onClick={onClose} className="absolute right-3 top-2 text-lg opacity-70 hover:opacity-100" aria-label="Cerrar">
          ✕
        </button>
        <p className="text-3xl" aria-hidden>
          {sale.avatar ?? "💸"}
        </p>
        <p className="mt-1 text-lg font-extrabold">¡Venta off{sale.seller ? ` de ${sale.seller}` : ""}!</p>
        <p className="text-2xl font-black">{formatMoney(sale.total)}</p>
        {more > 0 && <p className="mt-1 text-sm opacity-90">y {more === 1 ? "otra venta más" : `${more} ventas más`} 🔥</p>}
      </div>
    </div>
  );
}
