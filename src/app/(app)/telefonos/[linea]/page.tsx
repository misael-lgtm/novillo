import Link from "next/link";
import { notFound } from "next/navigation";
import { PHONE_LINES } from "@/lib/config";
import { WhatsAppLine } from "@/components/WhatsAppLine";

/** Pestañas Carritos / Güemes / Palermo: abrir el WhatsApp Business Web de cada teléfono. */
export default async function TelefonoPage({ params }: { params: Promise<{ linea: string }> }) {
  const { linea } = await params;
  const line = PHONE_LINES.find((l) => l.id === linea);
  if (!line) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">📱 Teléfonos</h1>
      <nav className="flex gap-1 rounded-xl bg-stone-100 p-1" aria-label="Teléfonos">
        {PHONE_LINES.map((l) => (
          <Link
            key={l.id}
            href={`/telefonos/${l.id}`}
            aria-current={l.id === line.id ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${l.id === line.id ? "bg-white shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <WhatsAppLine id={line.id} label={line.label} short={line.short} />
    </div>
  );
}
