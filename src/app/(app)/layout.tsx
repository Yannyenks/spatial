import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-org";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { CommandPalette } from "@/components/dashboard/command-palette";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const organization = await getCurrentOrganization(user);
  if (!organization) redirect("/register");

  return (
    <div className="min-h-screen md:flex">
      <AppSidebar user={user} organization={organization} />
      <main className="min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 bg-[var(--bg-muted)] px-4 py-6 sm:px-10 sm:py-8 md:min-h-screen">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <CommandPalette />
    </div>
  );
}
