"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  connectNotificationSocket,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/api";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function Topbar() {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!user) return;
    listNotifications().then(setNotifications).catch(() => {});

    const ws = connectNotificationSocket((notification) => {
      setNotifications((prev) => [notification, ...prev]);
    });
    return () => ws?.close();
  }, [user]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleRead(n: Notification) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
  }

  async function handleReadAll() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-5 py-3"
      style={{ background: "var(--ink-2)", borderBottom: "1px solid var(--line)" }}
    >
      <Link href="/projects" className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-sm"
          style={{ background: "var(--amber)", color: "#ffffff" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 14V6l6-4 6 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M6 14V9h4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", letterSpacing: "0.01em" }}>
          BuildSync
        </span>
      </Link>

      {user && (
        <div className="flex items-center gap-4">
          <Link href="/materials" className="label-mono hidden sm:inline" style={{ color: "var(--paper-dim)" }}>
            Materials
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-sm btn-ghost"
              aria-label="Notifications"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1.5a4 4 0 0 0-4 4v2.2c0 .5-.18 1-.5 1.4L2.5 10.6c-.5.6-.1 1.4.6 1.4h9.8c.7 0 1.1-.8.6-1.4l-1-1.5a2.2 2.2 0 0 1-.5-1.4V5.5a4 4 0 0 0-4-4Z"
                  stroke="var(--paper)"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
                <path d="M6.3 13.2a1.8 1.8 0 0 0 3.4 0" stroke="var(--paper)" strokeWidth="1.3" />
              </svg>
              {unreadCount > 0 && (
                <span
                  className="pulse absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                  style={{ background: "var(--amber)", color: "#ffffff" }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {open && (
              <div
                className="panel-raised absolute right-0 mt-2 w-80 overflow-hidden shadow-xl"
                style={{ maxHeight: "70vh" }}
              >
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <span className="label-mono">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={handleReadAll} className="label-mono" style={{ color: "var(--amber)" }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: "58vh", overflowY: "auto" }}>
                  {notifications.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm" style={{ color: "var(--paper-dim)" }}>
                      Nothing here yet.
                    </p>
                  )}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleRead(n)}
                      className="flex w-full flex-col items-start gap-1 px-3 py-3 text-left"
                      style={{
                        borderBottom: "1px solid var(--line-soft)",
                        background: n.read ? "transparent" : "rgba(217, 84, 31, 0.07)",
                      }}
                    >
                      <span className="text-sm" style={{ color: "var(--paper)" }}>
                        {n.message}
                      </span>
                      <span className="label-mono">{timeAgo(n.created_at)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm sm:inline" style={{ color: "var(--paper-dim)" }}>
              {user.full_name}
            </span>
            <button onClick={logout} className="label-mono btn-ghost px-2 py-1">
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
