import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fotos de los chats de WhatsApp (se achican en el navegador antes de mandarlas).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
