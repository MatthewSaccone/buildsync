"use client";

export type SettingsTabKey = "account" | "notifications" | "projects";

const TAB_LABELS: Record<SettingsTabKey, string> = {
  account: "Account",
  notifications: "Notifications",
  projects: "Projects",
};

const TAB_ORDER: SettingsTabKey[] = ["account", "notifications", "projects"];

interface SettingsTabsProps {
  activeTab: SettingsTabKey;
  onChange: (tab: SettingsTabKey) => void;
}

export default function SettingsTabs({ activeTab, onChange }: SettingsTabsProps) {
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
