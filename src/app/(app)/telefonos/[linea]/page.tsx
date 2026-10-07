import Link from "next/link";
import { notFound } from "next/navigation";
import { PHONE_LINES } from "@/lib/config";
import { requireMember } from "@/lib/session";
import { WaInbox } from "@/components/WaInbox";

/** Pestañas Carritos / Güemes / Palermo: vincular por QR y chatear desde el CRM. */
export default async function TelefonoPage({ params }: { params: Promise<{ linea: string }> }) {
  const { linea } = await params;
  const line = PHONE_LINES.find((l) => l.id === linea);
  if (!line) notFound();
  const { me } = await requireMember();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">📱 Teléfonos</h1>
        <Link href="/telefonos/conector" className="text-sm text-stone-500 underline">
          Instalar el conector
        </Link>
      </div>
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
      <WaInbox line={line.id} short={line.short} isAdmin={me.is_admin} connectorHelp="/telefonos/conector" />
    </div>
  );
}
