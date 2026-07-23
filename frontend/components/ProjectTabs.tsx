"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ProjectTabs({ projectId }: { projectId: number }) {
  const pathname = usePathname();

  const tabs = [
    { href: `/projects/${projectId}`, label: "Overview" },
    { href: `/projects/${projectId}/dashboard`, label: "Dashboard" },
    { href: `/projects/${projectId}/pins`, label: "Pins" },
    { href: `/projects/${projectId}/costs`, label: "Materials cost" },
  ];

  return (
    <nav className="mb-6 flex items-center gap-1 border-b" style={{ borderColor: "var(--line)" }}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="label-mono px-3 py-2"
            style={{
              color: active ? "var(--amber)" : "var(--paper-dim)",
              borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
