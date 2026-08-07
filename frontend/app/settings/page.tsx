"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import SettingsTabs, { type SettingsTabKey } from "@/components/SettingsTabs";
import AccountSettingsPanel from "@/components/settings/AccountSettingsPanel";
import NotificationsSettingsPanel from "@/components/settings/NotificationsSettingsPanel";
import ProjectsSettingsPanel from "@/components/settings/ProjectsSettingsPanel";
import { useAuth } from "@/lib/auth";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("account");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) return <PageLoader />;

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <Link href="/projects" className="label-mono mb-4 inline-block" style={{ color: "var(--amber)" }}>
          ← All projects
        </Link>

        <h1 className="mb-2" style={{ fontFamily: "var(--font-display)", fontSize: "1.7rem" }}>
          Settings
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--paper-dim)" }}>
          Manage your account, notifications, and project preferences.
        </p>

        <SettingsTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "account" && <AccountSettingsPanel />}
        {activeTab === "notifications" && <NotificationsSettingsPanel />}
        {activeTab === "projects" && <ProjectsSettingsPanel />}
      </main>
    </div>
  );
}
