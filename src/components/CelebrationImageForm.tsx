"use client";

// Equipo → Festejo de ventas: el admin sube una imagen (ej. un sticker) y se le saca el fondo liso automáticamente.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveCelebrationImage } from "@/app/goal-actions";

const MAX_SIDE = 420;

/**
 * Saca el fondo de color liso: desde los bordes de la imagen, "pinta" de transparente todo lo que se parece
 * al color del fondo (como el balde de pintura). Se detiene en el borde blanco del sticker, así no le come el dibujo.
 * Después recorta lo que sobra y la achica.
 */
export async function removeBackground(file: File, tolerance = 70): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // Color del fondo: el promedio de las 4 esquinas.
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + px[i * 4 + c], 0) / 4);
  const dist = (i: number) => Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]);

  const removed = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (removed[i] || dist(i) > tolerance) continue;
    removed[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  // Transparente lo de fondo; el borde de al lado, semitransparente para que no quede serruchado.
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < w * h; i++) {
    if (removed[i]) {
      px[i * 4 + 3] = 0;
      continue;
    }
    const x = i % w;
    const y = (i - x) / w;
    const edge = (x > 0 && removed[i - 1]) || (x < w - 1 && removed[i + 1]) || (i >= w && removed[i - w]) || (i < w * (h - 1) && removed[i + w]);
    if (edge) px[i * 4 + 3] = Math.min(255, Math.round((dist(i) / (tolerance * 2)) * 255));
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) throw new Error("vacía");
  ctx.putImageData(img, 0, 0);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const s = Math.min(1, MAX_SIDE / Math.max(cw, ch));
  const out = document.createElement("canvas");
  out.width = Math.round(cw * s);
  out.height = Math.round(ch * s);
  out.getContext("2d")!.drawImage(canvas, minX, minY, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

export function CelebrationImageForm({ image }: { image: string | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cut, setCut] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(f: File, removeBg: boolean) {
    setMsg(null);
    try {
      if (removeBg) setPreview(await removeBackground(f));
      else {
        const bmp = await createImageBitmap(f);
        const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * s);
        c.height = Math.round(bmp.height * s);
        c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
        setPreview(c.toDataURL("image/png"));
      }
    } catch {
      setMsg("No se pudo leer la imagen. Probá con un JPG o PNG.");
    }
  }

  async function save(value: string | null) {
    setBusy(true);
    const r = await saveCelebrationImage(value);
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setPreview(null);
    setFile(null);
    setMsg(value ? "¡Listo! Aparece en el próximo festejo." : "Sacada.");
    router.refresh();
  }

  const shown = preview ?? image;
  return (
    <section className="card space-y-3 p-5" id="festejo">
      <div>
        <h2 className="font-bold">🎉 Festejo de ventas</h2>
        <p className="text-sm text-stone-500">
          Cada vez que entra una venta off nueva en Tiendanube, vuelan emojis por la pantalla de todos con el vendedor y el monto. Si subís una imagen (ej. un
          sticker), también aparece. Se le saca el fondo solo.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="flex h-40 w-40 items-center justify-center rounded-2xl border border-stone-200"
          style={{ backgroundImage: "repeating-conic-gradient(var(--color-stone-200, #e7e5e4) 0 25%, transparent 0 50%)", backgroundSize: "16px 16px" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shown ? <img src={shown} alt="Imagen del festejo" className="max-h-36 max-w-36 object-contain" /> : <span className="text-4xl">🎉</span>}
        </div>
        <div className="space-y-2 text-sm">
          <label className="btn-secondary cursor-pointer">
            {image ? "Cambiar imagen" : "Subir imagen"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setFile(f);
                load(f, cut);
              }}
            />
          </label>
          {file && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cut}
                onChange={(e) => {
                  setCut(e.target.checked);
                  load(file, e.target.checked);
                }}
              />
              Sacar el fondo
            </label>
          )}
          <div className="flex gap-2">
            {preview && (
              <button onClick={() => save(preview)} disabled={busy} className="btn-primary">
                {busy ? "Guardando…" : "Guardar"}
              </button>
            )}
            {image && !preview && (
              <button onClick={() => save(null)} disabled={busy} className="btn-secondary">
                Sacar imagen
              </button>
            )}
          </div>
          {msg && <p className="text-xs font-medium text-stone-600">{msg}</p>}
        </div>
      </div>
    </section>
  );
}
