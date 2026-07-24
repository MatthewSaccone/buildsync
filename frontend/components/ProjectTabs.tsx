"use client";

type Tab =
  | "dashboard"
  | "sheets"
  | "pins"
  | "costs";

interface ProjectTabsProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}

export default function ProjectTabs({
  activeTab,
  onChange,
}: ProjectTabsProps) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "sheets", label: "Sheets" },
    { id: "pins", label: "Pins" },
    { id: "costs", label: "Costs" },
  ];

  return (
    <div
      className="flex gap-1 mb-6"
      style={{
        borderBottom: "1px solid var(--line)",
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="px-4 py-2 text-sm"
          style={{
            color:
              activeTab === tab.id
                ? "var(--amber)"
                : "var(--paper-dim)",
            borderBottom:
              activeTab === tab.id
                ? "2px solid var(--amber)"
                : "2px solid transparent",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
