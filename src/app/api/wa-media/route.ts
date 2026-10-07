// Fotos de los chats de WhatsApp (bucket privado): solo para el equipo.
import { requireMember } from "@/lib/session";

const PATH = /^(in|out)\/(carritos|guemes|palermo)\/[\w-]+\.(jpg|png|webp)$/;

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("p") ?? "";
  if (!PATH.test(path)) return new Response("Foto inválida", { status: 400 });
  const { supabase } = await requireMember();
  const { data, error } = await supabase.storage.from("wa-media").download(path);
  if (error || !data) return new Response("No se encontró la foto", { status: 404 });
  return new Response(data, {
    headers: {
      "content-type": data.type || "image/jpeg",
      // Cada foto tiene su propio nombre y no cambia nunca.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
