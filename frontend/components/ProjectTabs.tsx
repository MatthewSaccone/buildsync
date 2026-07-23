"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ProjectTabs({
  projectId,
}: {
  projectId: number;
}) {
  const pathname = usePathname();

  const tabs = [
    {
      href: `/projects/${projectId}`,
      label: "Sheets",
      exact: true,
    },
    {
      href: `/projects/${projectId}/dashboard`,
      label: "Dashboard",
    },
    {
      href: `/projects/${projectId}/pins`,
      label: "Pins",
    },
    {
      href: `/projects/${projectId}/costs`,
      label: "Costs",
    },
  ];

  return (
    <div
      className="mb-6 flex gap-1 overflow-x-auto border-b"
      style={{
        borderColor: "var(--line)",
      }}
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname?.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="label-mono px-3 py-2 transition-colors"
            style={{
              color: active
                ? "var(--amber)"
                : "var(--paper-dim)",
              borderBottom: active
                ? "2px solid var(--amber)"
                : "2px solid transparent",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
