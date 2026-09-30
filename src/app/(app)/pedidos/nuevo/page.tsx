import { getTeam, requireMember } from "@/lib/session";
import { NewOrderForm } from "@/components/NewOrderForm";

export default async function NewOrderPage() {
  const { me } = await requireMember();
  const team = await getTeam();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Nuevo pedido</h1>
      <NewOrderForm team={team} me={me.email} />
    </div>
  );
}
