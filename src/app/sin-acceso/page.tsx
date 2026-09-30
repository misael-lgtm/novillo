export default function NoAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-4 p-8 text-center">
        <h1 className="text-xl font-bold">Todavía no tenés acceso</h1>
        <p className="text-sm text-stone-600">
          Tu cuenta de Google no está cargada en el equipo. Pedile a un admin que te sume desde <b>Equipo</b> con el mismo mail con el que entraste.
        </p>
        <form action="/auth/logout" method="post">
          <button className="btn-secondary w-full">Entrar con otra cuenta</button>
        </form>
      </div>
    </main>
  );
}
