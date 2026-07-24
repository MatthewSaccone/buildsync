"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import { getProject, getDashboard, type Project, type DashboardData } from "@/lib/api";

const STATUS_COLOR: Record<string, string> = {
  open: "var(--blue)",
  in_progress: "var(--gold)",
  blocked: "var(--red)",
  resolved: "var(--green)",
  verified: "var(--teal)",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function Bar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span style={{ textTransform: "capitalize" }}>{label.replace(/_/g, " ")}</span>
        <span className="label-mono">{count}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: "var(--ink)" }}>
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    Promise.all([getProject(projectId), getDashboard(projectId)])
      .then(([p, d]) => {
        setProject(p);
        setDashboard(d);
      })
      .finally(() => setFetching(false));
  }, [user, projectId]);

  if (loading || !user || fetching || !project || !dashboard) return <PageLoader />;

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <Link href={`/projects/${projectId}`} className="label-mono mb-4 inline-block" style={{ color: "var(--amber)" }}>
          ← Back to project
        </Link>
        <h1 className="mb-1" style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}>
          Dashboard
        </h1>
        <p className="label-mono mb-6">
          {project.name} · {dashboard.total_pins} pin{dashboard.total_pins === 1 ? "" : "s"} total
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="panel flex flex-col gap-3 p-5">
            <span className="label-mono">By status</span>
            {Object.entries(dashboard.by_status).map(([status, count]) => (
              <Bar key={status} label={status} count={count} total={dashboard.total_pins} color={STATUS_COLOR[status] ?? "var(--paper-dim)"} />
            ))}
            {Object.keys(dashboard.by_status).length === 0 && (
              <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                No pins yet.
              </p>
            )}
          </div>

          <div className="panel flex flex-col gap-3 p-5">
            <span className="label-mono">By priority</span>
            {Object.entries(dashboard.by_priority).map(([priority, count]) => (
              <Bar key={priority} label={priority} count={count} total={dashboard.total_pins} color="var(--amber)" />
            ))}
            {Object.keys(dashboard.by_priority).length === 0 && (
              <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                No pins yet.
              </p>
            )}
          </div>

          <div className="panel flex flex-col gap-3 p-5">
            <span className="label-mono">By trade</span>
            {Object.entries(dashboard.by_trade).map(([trade, count]) => (
              <Bar key={trade} label={trade} count={count} total={dashboard.total_pins} color="var(--blue)" />
            ))}
            {Object.keys(dashboard.by_trade).length === 0 && (
              <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                No pins yet.
              </p>
            )}
          </div>

          <div className="panel flex flex-col gap-2 p-5">
            <span className="label-mono mb-1">Overdue (7+ days open)</span>
            {dashboard.overdue.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                Nothing overdue. Nice.
              </p>
            ) : (
              dashboard.overdue.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${projectId}/sheets/${p.sheet_id}`}
                  className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:opacity-80"
                  style={{ background: "var(--ink)" }}
                >
                  <span>{p.title}</span>
                  <span className="label-mono" style={{ color: "var(--red)" }}>
                    {p.days_open} day{p.days_open === 1 ? "" : "s"}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="panel mt-6 flex flex-col gap-2 p-5">
          <span className="label-mono mb-1">Recent activity</span>
          {dashboard.recent_activity.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
              Nothing yet.
            </p>
          ) : (
            dashboard.recent_activity.map((a, i) => (
              <Link
                key={i}
                href={`/projects/${projectId}/sheets/${a.sheet_id}`}
                className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:opacity-80"
              >
                <span>{a.message}</span>
                <span className="label-mono">{timeAgo(a.created_at)}</span>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
