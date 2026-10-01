import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Wayfarer CRM",
  description: "Pedidos, clientes y tareas de Wayfarer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1c1917",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
