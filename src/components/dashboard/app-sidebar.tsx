"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGrid, Building2, CreditCard, Users, Settings, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import type { AuthUser, Organization } from "@/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/projects", label: "Projects", icon: Building2 },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ user, organization }: { user: AuthUser; organization: Organization }) {
  const pathname = usePathname();
  // Below md the sidebar is a drawer behind a top bar: a fixed 16rem
  // column would leave a phone almost no room for the page itself.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    // Hard navigation, not router.push() — see login/page.tsx for why.
    window.location.href = "/";
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--bg)] px-4 md:hidden">
        <Link href="/dashboard" className="text-sm font-semibold tracking-[0.2em] uppercase">
          Spatial
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="focus-ring -mr-2 rounded-[var(--radius-md)] p-2 text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--bg)] px-4 py-6 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-8 flex items-center justify-between">
          <Link href="/dashboard" className="px-2 text-sm font-semibold tracking-[0.2em] uppercase">
            Spatial
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="focus-ring rounded-[var(--radius-md)] p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)] md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-6 rounded-[var(--radius-md)] bg-[var(--bg-muted)] px-3 py-2.5">
          <p className="truncate text-sm font-medium">{organization.name}</p>
          <p className="text-xs text-[var(--fg-muted)]">{organization.plan} plan</p>
        </div>

        <div className="mb-6 hidden items-center justify-between rounded-[var(--radius-md)] border md:flex border-[var(--line)] px-3 py-2 text-xs text-[var(--fg-muted)]">
          <span>Command palette</span>
          <kbd className="rounded border border-[var(--line)] bg-[var(--bg-muted)] px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--fg)] text-[var(--bg)]"
                    : "text-[var(--fg-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--fg)]",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <p className="truncate px-2 text-xs text-[var(--fg-muted)]">{user.email}</p>
          <button
            onClick={signOut}
            className="focus-ring mt-2 flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--fg)]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
