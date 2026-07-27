"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabKey = "dashboard" | "sheets" | "pins" | "costs" | "chat";

const TAB_LABELS: Record<TabKey, string> = {
  sheets: "Sheets",
  dashboard: "Dashboard",
  pins: "Pins",
  costs: "Costs",
  chat: "Chat",
};

const TAB_ORDER: TabKey[] = ["sheets", "dashboard", "pins", "costs", "chat"];

interface ProjectTabsProps {
  projectId?: number;
  activeTab?: TabKey;
  onChange?: (tab: TabKey) => void;
}

export default function ProjectTabs({ projectId, activeTab, onChange }: ProjectTabsProps) {
  const pathname = usePathname();

  // Controlled mode: caller owns which tab is active and handles the switch
  // itself (e.g. a page that swaps sections in place instead of navigating).
  if (activeTab !== undefined && onChange !== undefined) {
    return (
      <div className="mb-6 flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--line)" }}>
        {TAB_ORDER.map((key) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className="label-mono px-3 py-2 transition-colors"
              style={{
                color: active ? "var(--amber)" : "var(--paper-dim)",
                background: "transparent",
                border: "none",
                borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              {TAB_LABELS[key]}
            </button>
          );
        })}
      </div>
    );
  }

  // Default mode: real navigation between project sub-pages.
  if (projectId === undefined) return null;

  const tabs = [
    { href: `/projects/${projectId}`, label: TAB_LABELS.sheets, exact: true },
    { href: `/projects/${projectId}/dashboard`, label: TAB_LABELS.dashboard },
    { href: `/projects/${projectId}/pins`, label: TAB_LABELS.pins },
    { href: `/projects/${projectId}/costs`, label: TAB_LABELS.costs },
    { href: `/projects/${projectId}/chat`, label: TAB_LABELS.chat },
  ];

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--line)" }}>
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="label-mono px-3 py-2 transition-colors"
            style={{
              color: active ? "var(--amber)" : "var(--paper-dim)",
              borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
