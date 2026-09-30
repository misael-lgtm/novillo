import { requireMember } from "@/lib/session";
import { Nav } from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requireMember();
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <Nav name={me.name} isAdmin={me.is_admin} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
