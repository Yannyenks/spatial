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
    <div className="flex min-h-screen">
      <AppSidebar user={user} organization={organization} />
      <main className="flex-1 bg-[var(--bg-muted)] px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <CommandPalette />
    </div>
  );
}
