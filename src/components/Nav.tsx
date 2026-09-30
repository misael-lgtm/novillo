"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Hoy", icon: "☀️" },
  { href: "/tablero", label: "Tablero", icon: "🗂️" },
  { href: "/pedidos/nuevo", label: "Nuevo", icon: "➕", primary: true },
  { href: "/clientes", label: "Clientes", icon: "👥" },
  { href: "/tareas", label: "Tareas", icon: "✅" },
];

export function Nav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Arriba (compu) */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link href="/" className="text-lg font-black tracking-tight">
            WAYFARER
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {LINKS.map((l) =>
              l.primary ? (
                <Link key={l.href} href={l.href} className="btn-primary ml-2 py-2">
                  + Nuevo pedido
                </Link>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${active(l.href) ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
                >
                  {l.label}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {isAdmin && (
              <Link href="/equipo" className="text-stone-500 hover:text-stone-900">
                Equipo
              </Link>
            )}
            <Link href="/archivo" className="text-stone-500 hover:text-stone-900">
              Archivo
            </Link>
            <span className="hidden font-medium sm:inline">{name}</span>
            <form action="/auth/logout" method="post">
              <button className="text-stone-500 hover:text-stone-900">Salir</button>
            </form>
          </div>
        </div>
      </header>

      {/* Abajo (celu) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-stone-200 bg-white md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active(l.href) ? "font-bold text-stone-900" : "text-stone-500"}`}
          >
            <span className={`text-xl ${l.primary ? "flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-white" : ""}`}>
              {l.primary ? "+" : l.icon}
            </span>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
