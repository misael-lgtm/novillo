import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">No encontramos eso</h1>
      <Link href="/" className="btn-primary">
        Volver al inicio
      </Link>
    </main>
  );
}
