"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "capture", label: "Capture" },
  { segment: "assets", label: "Assets" },
  { segment: "spaces", label: "Spaces" },
  { segment: "reconstruction", label: "Reconstruction" },
  { segment: "experience", label: "Experience" },
  { segment: "ai", label: "AI" },
  { segment: "analytics", label: "Analytics" },
  { segment: "settings", label: "Settings" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-[var(--line)] px-1">
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-[var(--fg)] text-[var(--fg)]"
                : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
