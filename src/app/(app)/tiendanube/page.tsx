import Link from "next/link";
import { redirect } from "next/navigation";
import { monthLabel, monthStart } from "@/lib/goals";
import { formatMoney } from "@/lib/rules";
import { requireMember } from "@/lib/session";
import { exchangeCode, isConnected, storeSalesForMonth, tiendanube } from "@/lib/tiendanube";

const REDIRECT = "https://wayfarer-crm.vercel.app/tiendanube";

/** Conectar la tienda online (Tiendanube) para que sus ventas sumen al objetivo. Solo admin. */
export default async function TiendanubePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { me } = await requireMember();
  if (!me.is_admin) redirect("/");
  const { code } = await searchParams;

  // Vuelta desde Tiendanube después de autorizar: mostrar lo que hay que copiar a Vercel.
  if (code) {
    const r = await exchangeCode(code);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Tienda online</h1>
        {r.ok ? (
          <div className="card space-y-4 p-5">
            <p className="font-semibold text-emerald-800">✔ Tiendanube autorizó al CRM.</p>
            <p className="text-sm">
              Último paso: en <b>Vercel → wayfarer-crm → Settings → Environment Variables</b> agregá estas dos variables y después hacé{" "}
              <b>Redeploy</b>. No las compartas con nadie: el token da acceso a los pedidos de la tienda.
            </p>
            <Secret name="TIENDANUBE_STORE_ID" value={r.storeId} />
            <Secret name="TIENDANUBE_TOKEN" value={r.token} />
            <p className="text-xs text-stone-500">Si recargás esta página no se vuelve a generar: para otro token, autorizá de nuevo.</p>
          </div>
        ) : (
          <div className="card space-y-3 p-5">
            <p className="font-semibold text-rose-800">No se pudo terminar la conexión: {r.error}</p>
            <Link href="/tiendanube" className="btn-secondary">
              Volver a empezar
            </Link>
          </div>
        )}
      </div>
    );
  }

  const month = monthStart();
  const sales = isConnected() ? await storeSalesForMonth(month) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tienda online</h1>
        <p className="text-sm text-stone-500">
          Con la tienda conectada, los pedidos pagados en Tiendanube suman al objetivo del equipo (no al de cada vendedor). Las tarjetas del CRM con canal
          “Tienda online” no se cuentan dos veces.
        </p>
      </div>

      {sales ? (
        <div className="card p-5">
          {sales.ok ? (
            <p>
              ✔ <b>Conectada.</b> En {monthLabel(month)} la tienda lleva <b>{formatMoney(sales.total)}</b> en {sales.ventas}{" "}
              {sales.ventas === 1 ? "pedido pagado" : "pedidos pagados"}.
            </p>
          ) : (
            <p className="text-rose-800">⚠️ Está configurada pero no se pudo leer: {sales.error}. Revisá el token o autorizá de nuevo (paso 3).</p>
          )}
        </div>
      ) : (
        <ol className="card list-decimal space-y-4 p-5 pl-10 text-sm">
          <li>
            Entrá a <b>partners.tiendanube.com</b> con tu cuenta (si no tenés, creala; es gratis) y creá una <b>aplicación</b> para tu tienda.
            <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600">
              <li>
                Permisos: solo <b>Órdenes → Ver</b> (lectura de pedidos).
              </li>
              <li>
                URL de redirección: <code className="rounded bg-stone-100 px-1.5 py-0.5">{REDIRECT}</code>
              </li>
            </ul>
          </li>
          <li>
            En Vercel (<b>Settings → Environment Variables</b>) cargá el <b>ID de la app</b> como <code>TIENDANUBE_APP_ID</code> y el{" "}
            <b>Client secret</b> como <code>TIENDANUBE_CLIENT_SECRET</code>. Después <b>Redeploy</b>.
          </li>
          <li>
            {tiendanube.appId && tiendanube.clientSecret ? (
              <>
                Apretá acá y aceptá en tu tienda:{" "}
                <a href={`https://www.tiendanube.com/apps/${tiendanube.appId}/authorize`} className="btn-primary mt-2">
                  Autorizar en mi tienda
                </a>
              </>
            ) : (
              <>Cuando esté hecho el paso 2, acá aparece el botón <b>Autorizar en mi tienda</b>.</>
            )}
          </li>
          <li>Tiendanube te devuelve a esta página con dos datos para cargar en Vercel. Los cargás, Redeploy, y listo.</li>
        </ol>
      )}
      <Link href="/equipo#objetivos" className="text-sm underline">
        ← Volver a objetivos
      </Link>
    </div>
  );
}

function Secret({ name, value }: { name: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-stone-500">{name}</p>
      <code className="block break-all rounded-lg bg-stone-100 px-3 py-2 text-sm select-all">{value}</code>
    </div>
  );
}
