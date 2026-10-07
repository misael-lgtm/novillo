import Link from "next/link";

/** Instructivo para instalar el conector de WhatsApp en la compu del local (o un Android). */
export default function ConectorPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/telefonos/carritos" className="text-sm underline">
        ← Volver a Teléfonos
      </Link>
      <h1 className="text-2xl font-bold">🔌 Conector de WhatsApp</h1>
      <p className="text-sm text-stone-600">
        Es un programa chico que mantiene vinculados los WhatsApp de Carritos, Güemes y Palermo y los conecta con el CRM. Va en <b>una sola compu</b> que
        quede prendida (sirve para los 3 teléfonos). Si esa compu se apaga, los mensajes siguen llegando a los celulares y el CRM se pone al día cuando la
        prendés.
      </p>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">En una PC con Windows (recomendado)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Instalá <b>Node.js</b> (versión LTS) desde <b>nodejs.org</b>: siguiente, siguiente, finalizar.
          </li>
          <li>
            Descomprimí la carpeta <b>wa-conector</b> que te pasó el admin en <b>Documentos</b>.
          </li>
          <li>
            Abrí el archivo <b>.env</b> con el Bloc de notas y completá las dos claves que te pasó el admin. Guardá.
          </li>
          <li>
            Doble clic en <b>iniciar.bat</b>. La primera vez tarda un poco (instala lo que necesita). Cuando dice “No cierres esta ventana”, está andando.
          </li>
          <li>
            Volvé al CRM, a <b>📱 Teléfonos</b>: en cada pestaña aparece el QR para vincular ese teléfono.
          </li>
          <li>
            Para que arranque solo al prender la compu: apretá <b>Windows + R</b>, escribí <b>shell:startup</b>, Enter, y copiá ahí un acceso directo a{" "}
            <b>iniciar.bat</b>.
          </li>
        </ol>
        <p className="text-xs text-stone-500">
          Que la compu no se suspenda: Configuración → Sistema → Inicio/apagado → Suspender: <b>Nunca</b> (enchufada).
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">En un celular Android (si no hay PC)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Instalá <b>Termux</b> desde <b>F-Droid</b> (la versión de Play Store está vieja).
          </li>
          <li>
            En Termux escribí: <code className="rounded bg-stone-100 px-1">pkg install nodejs</code> y copiá la carpeta <b>wa-conector</b> al celu.
          </li>
          <li>
            Entrá a la carpeta y corré: <code className="rounded bg-stone-100 px-1">npm install</code> y después{" "}
            <code className="rounded bg-stone-100 px-1">termux-wake-lock; node conector.mjs</code>
          </li>
          <li>
            En Ajustes de Android sacale a Termux la <b>optimización de batería</b>, y dejá el celu enchufado y con wifi.
          </li>
        </ol>
        <p className="text-xs text-stone-500">Funciona, pero Android a veces cierra apps en segundo plano: en una PC se corta menos.</p>
      </section>

      <section className="card space-y-2 p-5 text-sm">
        <h2 className="font-bold">Bueno saber</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Los celulares siguen funcionando normal: el CRM es un “dispositivo vinculado” más, como WhatsApp Web.</li>
          <li>No es la conexión oficial de WhatsApp: no mandes mensajes masivos ni a gente que no te escribió, para no arriesgar el número.</li>
          <li>Si un teléfono se desvincula (por ejemplo desde el celu), en su pestaña vuelve a aparecer el QR.</li>
        </ul>
      </section>
    </div>
  );
}
