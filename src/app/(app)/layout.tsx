import { requireMember } from "@/lib/session";
import { GoalBar } from "@/components/GoalBar";
import { Nav } from "@/components/Nav";
import { SaleCelebration } from "@/components/SaleCelebration";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, shared } = await requireMember();
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <Nav name={me.name} isAdmin={me.is_admin} shared={shared} />
      <GoalBar />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <SaleCelebration />
    </div>
  );
}
