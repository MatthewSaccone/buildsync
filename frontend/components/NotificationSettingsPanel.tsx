"use client";

import { useEffect, useState } from "react";
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from "@/lib/api";
import {
  desktopNotificationsSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from "@/lib/desktopNotifications";

const ROWS: { key: keyof NotificationSettings; label: string; hint: string }[] = [
  { key: "notify_on_message", label: "Direct messages", hint: "When someone sends you a DM" },
  { key: "notify_on_mention", label: "Mentions", hint: "When someone @mentions you" },
  {
    key: "notify_on_task_assignment",
    label: "Task assignments",
    hint: "When you're assigned to a task",
  },
];

export default function NotificationSettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState(getNotificationPermission());

  useEffect(() => {
    getNotificationSettings().then(setSettings).catch(() => {});
  }, []);

  async function toggle(key: keyof NotificationSettings) {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSaving(true);
    try {
      await updateNotificationSettings({ [key]: next[key] });
    } finally {
      setSaving(false);
    }
  }

  async function handleDesktopToggle() {
    if (!settings) return;
    // Turning it on for the first time needs browser permission - ask
    // before flipping the preference so we don't end up "enabled" with
    // no way to actually show anything.
    if (!settings.desktop_enabled && permission !== "granted") {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== "granted") return;
    }
    toggle("desktop_enabled");
  }

  return (
    <div
      className="panel-raised absolute right-0 mt-2 w-80 overflow-hidden shadow-xl"
      style={{ maxHeight: "70vh" }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <span className="label-mono">Notification settings</span>
        <button onClick={onClose} className="label-mono" style={{ color: "var(--paper-dim)" }}>
          Close
        </button>
      </div>

      {!settings ? (
        <p className="px-3 py-6 text-center text-sm" style={{ color: "var(--paper-dim)" }}>
          Loading…
        </p>
      ) : (
        <div className="px-3 py-2" style={{ maxHeight: "58vh", overflowY: "auto" }}>
          <p className="label-mono pb-1 pt-1" style={{ color: "var(--paper-dim)" }}>
            Notify me about
          </p>
          {ROWS.map((row) => (
            <label
              key={row.key}
              className="flex cursor-pointer items-center justify-between gap-2 py-2"
              style={{ borderBottom: "1px solid var(--line-soft)" }}
            >
              <span>
                <span className="block text-sm" style={{ color: "var(--paper)" }}>
                  {row.label}
                </span>
                <span className="block text-xs" style={{ color: "var(--paper-dim)" }}>
                  {row.hint}
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings[row.key]}
                onChange={() => toggle(row.key)}
                className="h-4 w-4 shrink-0"
              />
            </label>
          ))}

          <p className="label-mono pb-1 pt-3" style={{ color: "var(--paper-dim)" }}>
            Desktop
          </p>
          <label className="flex cursor-pointer items-center justify-between gap-2 py-2">
            <span>
              <span className="block text-sm" style={{ color: "var(--paper)" }}>
                Desktop notifications
              </span>
              <span className="block text-xs" style={{ color: "var(--paper-dim)" }}>
                {!desktopNotificationsSupported()
                  ? "Not supported in this browser"
                  : permission === "denied"
                  ? "Blocked — enable in your browser's site settings"
                  : "Show a system notification for new activity"}
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.desktop_enabled}
              onChange={handleDesktopToggle}
              disabled={!desktopNotificationsSupported() || permission === "denied"}
              className="h-4 w-4 shrink-0"
            />
          </label>

          {saving && (
            <p className="label-mono pt-2" style={{ color: "var(--paper-dim)" }}>
              Saving…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
