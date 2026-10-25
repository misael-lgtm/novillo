import type { MetadataRoute } from "next";

// Para instalar el CRM como app en el celu (Chrome → "Instalar app" / "Agregar a pantalla principal"): se abre a pantalla completa, con su ícono.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wayfarer CRM",
    short_name: "Wayfarer",
    description: "Pedidos, clientes, teléfonos y objetivos de Wayfarer",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#121212",
    theme_color: "#1c1917",
    lang: "es-AR",
    icons: [
      { src: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Teléfonos", url: "/telefonos/carritos" },
      { name: "Locales", url: "/locales" },
      { name: "Carritos", url: "/carritos" },
    ],
  };
}
