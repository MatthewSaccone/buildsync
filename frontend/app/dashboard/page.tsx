"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";

import { useAuth } from "@/lib/auth";
import {
  listProjects,
  getDashboard,
  type Project,
  type DashboardData,
  type OverduePin,
  type ActivityEvent,
} from "@/lib/api";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

interface ProjectSummary {
  project: Project;
  dashboard: DashboardData | null;
}

interface OverdueWithProject extends OverduePin {
  projectId: number;
  projectName: string;
}

interface ActivityWithProject extends ActivityEvent {
  projectId: number;
  projectName: string;
}

function getActivitySheetId(activity: ActivityWithProject): number | null {
  const sheetId = activity.extra?.sheet_id;

  return typeof sheetId === "number" ? sheetId : null;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    listProjects()
      .then(async (projects) => {
        const results = await Promise.all(
          projects.map(async (project) => {
            try {
              const dashboard = await getDashboard(project.id);
              return { project, dashboard };
            } catch {
              return { project, dashboard: null };
            }
          })
        );
        setSummaries(results);
      })
      .finally(() => setFetching(false));
  }, [user]);

  if (loading || !user) {
    return <PageLoader />;
  }

  const totalProjects = summaries.length;
  const totalPins = summaries.reduce((sum, s) => sum + (s.dashboard?.total_pins ?? 0), 0);

  const openStatuses = ["open", "in_progress", "blocked"];
  const totalOpen = summaries.reduce((sum, s) => {
    if (!s.dashboard) return sum;
    return (
      sum +
      openStatuses.reduce((inner, status) => inner + (s.dashboard!.by_status[status] ?? 0), 0)
    );
  }, 0);

  const overdue: OverdueWithProject[] = summaries
    .flatMap((s) =>
      (s.dashboard?.overdue ?? []).map((p) => ({
        ...p,
        projectId: s.project.id,
        projectName: s.project.name,
      }))
    )
    .sort((a, b) => b.days_open - a.days_open)
    .slice(0, 8);

  const recentActivity: ActivityWithProject[] = summaries
    .flatMap((s) =>
      (s.dashboard?.recent_activity ?? []).map((a) => ({
        ...a,
        projectId: s.project.id,
        projectName: s.project.name,
      }))
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <div className="mb-6">
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>Dashboard</h1>
          <p className="label-mono mt-1" style={{ color: "var(--paper-dim)" }}>
            Overview across all your projects
          </p>
        </div>

        {fetching ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel h-24 animate-pulse" style={{ opacity: 0.5 }} />
            ))}
          </div>
        ) : totalProjects === 0 ? (
          <div className="panel px-6 py-12 text-center" style={{ color: "var(--paper-dim)" }}>
            No projects yet.{" "}
            <Link href="/projects" style={{ color: "var(--amber)" }}>
              Create your first project
            </Link>
            .
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-3 md:grid-cols-3">
              <div className="panel p-5">
                <span className="label-mono" style={{ color: "var(--paper-dim)" }}>
                  Projects
                </span>
                <p className="mt-1 text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                  {totalProjects}
                </p>
              </div>
              <div className="panel p-5">
                <span className="label-mono" style={{ color: "var(--paper-dim)" }}>
                  Open pins
                </span>
                <p className="mt-1 text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                  {totalOpen}
                </p>
              </div>
              <div className="panel p-5">
                <span className="label-mono" style={{ color: "var(--paper-dim)" }}>
                  Total pins
                </span>
                <p className="mt-1 text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                  {totalPins}
                </p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="panel flex flex-col gap-2 p-5">
                <span className="label-mono mb-1">Overdue (7+ days open)</span>
                {overdue.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                    Nothing overdue. Nice.
                  </p>
                ) : (
                  overdue.map((p) => (
                    <Link
                      key={`${p.projectId}-${p.id}`}
                      href={`/projects/${p.projectId}/sheets/${p.sheet_id}`}
                      className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:opacity-80"
                      style={{ background: "var(--ink)" }}
                    >
                      <span className="flex flex-col">
                        <span>{p.title}</span>
                        <span className="label-mono" style={{ color: "var(--paper-dim)" }}>
                          {p.projectName}
                        </span>
                      </span>
                      <span className="label-mono" style={{ color: "var(--red)" }}>
                        {p.days_open} day{p.days_open === 1 ? "" : "s"}
                      </span>
                    </Link>
                  ))
                )}
              </div>

              <div className="panel flex flex-col gap-2 p-5">
                <span className="label-mono mb-1">Recent activity</span>
                {recentActivity.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                    Nothing yet.
                  </p>
                ) : (
                  recentActivity.map((a, i) => {
                    const sheetId = getActivitySheetId(a);

                    return (
                      <Link
                        key={i}
                        href={
                          sheetId
                            ? `/projects/${a.projectId}/sheets/${sheetId}`
                            : `/projects/${a.projectId}`
                        }
                        className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:opacity-80"
                      >
                        <span className="flex flex-col">
                          <span>{a.message}</span>
                          <span className="label-mono" style={{ color: "var(--paper-dim)" }}>
                            {a.projectName}
                          </span>
                        </span>
                        <span className="label-mono">{timeAgo(a.created_at)}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="label-mono" style={{ color: "var(--paper-dim)" }}>
                  Your projects
                </span>
                <Link href="/projects" className="label-mono" style={{ color: "var(--amber)" }}>
                  View all
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {summaries.map(({ project, dashboard }) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="panel p-5 transition-colors hover:border-[var(--amber)]"
                  >
                    <h2 className="font-medium">{project.name}</h2>
                    <p className="label-mono mt-2" style={{ color: "var(--paper-dim)" }}>
                      {project.address || "No address"}
                    </p>
                    {dashboard && (
                      <p className="label-mono mt-2" style={{ color: "var(--paper-dim)" }}>
                        {dashboard.total_pins} pin{dashboard.total_pins === 1 ? "" : "s"}
                        {dashboard.overdue.length > 0 && (
                          <span style={{ color: "var(--red)" }}>
                            {" "}
                            · {dashboard.overdue.length} overdue
                          </span>
                        )}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
