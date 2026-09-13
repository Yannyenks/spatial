"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Building2,
  CreditCard,
  Users,
  Settings,
  Plus,
  LogOut,
  Search,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";

/**
 * Command palette (execution-plan §81, brief §81-82): ⌘K/Ctrl+K from
 * anywhere in the app. Uses `cmdk` (the same accessible primitive behind
 * most production command menus — Vercel, Linear, Raycast) rather than a
 * hand-rolled listbox, per "load libraries, don't hand-roll them" for
 * anything carrying real accessibility weight (roving focus, typeahead,
 * ARIA combobox semantics).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  async function signOut() {
    setOpen(false);
    await apiFetch("/api/auth/logout", { method: "POST" });
    // Hard navigation, not router.push() — see login/page.tsx for why.
    window.location.href = "/";
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <Command
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg)] shadow-[var(--shadow-lift)]"
        onClick={(e) => e.stopPropagation()}
        label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4">
          <Search className="h-4 w-4 text-[var(--fg-muted)]" />
          <Command.Input
            autoFocus
            placeholder="Go to project, create space, publish…"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-[var(--fg-muted)]"
          />
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--fg-muted)]">
            No matching command.
          </Command.Empty>

          <Command.Group heading="Navigate" className="text-technical px-2 pb-1 pt-2 text-[var(--fg-muted)]">
            <Item icon={LayoutGrid} label="Dashboard" onSelect={() => go("/dashboard")} />
            <Item icon={Building2} label="Projects" onSelect={() => go("/projects")} />
            <Item icon={CreditCard} label="Billing" onSelect={() => go("/billing")} />
            <Item icon={Users} label="Team" onSelect={() => go("/team")} />
            <Item icon={Settings} label="Settings" onSelect={() => go("/settings")} />
          </Command.Group>

          <Command.Group heading="Actions" className="text-technical px-2 pb-1 pt-3 text-[var(--fg-muted)]">
            <Item icon={Plus} label="New project" onSelect={() => go("/projects/new")} />
            <Item icon={LogOut} label="Sign out" onSelect={signOut} />
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function Item({ icon: Icon, label, onSelect }: { icon: React.ComponentType<{ className?: string }>; label: string; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      // normal-case overrides the uppercase text-transform inherited from
      // the parent Command.Group's `.text-technical` heading style — that
      // class is meant for the heading label only, but text-transform
      // inherits to children unless explicitly reset here.
      className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm normal-case text-[var(--fg)] data-[selected=true]:bg-[var(--bg-muted)]"
    >
      <Icon className="h-4 w-4 text-[var(--fg-muted)]" />
      {label}
    </Command.Item>
  );
}
