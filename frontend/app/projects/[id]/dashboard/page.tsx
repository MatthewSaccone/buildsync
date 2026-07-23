"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import ProjectTabs from "@/components/ProjectTabs";
import { useAuth } from "@/lib/auth";
import { getProject, getDashboard, type Project, type DashboardData, type PinStatus } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  resolved: "Resolved",
  verified: "Verified",
};

const STATUS_COLOR: Record<string, string> = {
  open: "var(--blue)",
  in_progress: "var(--amber)",
  blocked: "var(--red)",
  resolved: "var(--green)",
  verified: "var(--green)",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--paper-dim)",
  normal: "var(--blue)",
  high: "var(--amber)",
  urgent: "var(--red)",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 flex-shrink-0" style={{ color: "var(--paper-dim)" }}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--ink)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="label-mono w-8 text-right">{count}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    Promise.all([getProject(projectId), getDashboard(projectId)])
      .then(([p, d]) => {
        setProject(p);
        setData(d);
      })
      .finally(() => setFetching(false));
  }, [user, projectId]);

  if (loading || !user || fetching || !project || !data) return <PageLoader />;

  const statusEntries = Object.entries(data.by_status) as [PinStatus, number][];
  const tradeEntries = Object.entries(data.by_trade).sort((a, b) => b[1] - a[1]);
  const priorityEntries = Object.entries(data.by_priority);

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <Link href={`/projects/${projectId}`} className="label-mono mb-4 inline-block" style={{ color: "var(--amber)" }}>
          ← Back to project
        </Link>
        <div className="mb-2">
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.7rem" }}>{project.name}</h1>
          <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
            Dashboard
          </p>
        </div>

        <ProjectTabs projectId={projectId} />

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="panel px-4 py-3">
            <p className="label-mono">Total pins</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>{data.total_pins}</p>
          </div>
          {statusEntries
            .filter(([s]) => s === "open" || s === "blocked" || s === "in_progress")
            .map(([status, count]) => (
              <div key={status} className="panel px-4 py-3">
                <p className="label-mono">{STATUS_LABEL[status] ?? status}</p>
                <p style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", color: STATUS_COLOR[status] }}>
                  {count}
                </p>
              </div>
            ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="panel flex flex-col gap-3 p-4">
            <h2 className="label-mono">By status</h2>
            {statusEntries.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                No pins yet.
              </p>
            ) : (
              statusEntries.map(([status, count]) => (
                <BarRow
                  key={status}
                  label={STATUS_LABEL[status] ?? status}
                  count={count}
                  total={data.total_pins}
                  color={STATUS_COLOR[status] ?? "var(--blue)"}
                />
              ))
            )}
          </section>

          <section className="panel flex flex-col gap-3 p-4">
            <h2 className="label-mono">By priority</h2>
            {priorityEntries.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                No pins yet.
              </p>
            ) : (
              priorityEntries.map(([priority, count]) => (
                <BarRow
                  key={priority}
                  label={priority}
                  count={count}
                  total={data.total_pins}
                  color={PRIORITY_COLOR[priority] ?? "var(--blue)"}
                />
              ))
            )}
          </section>

          <section className="panel flex flex-col gap-3 p-4">
            <h2 className="label-mono">By trade</h2>
            {tradeEntries.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                No trade assignments yet.
              </p>
            ) : (
              tradeEntries.map(([trade, count]) => (
                <BarRow key={trade} label={trade.replace(/_/g, " ")} count={count} total={data.total_pins} color="var(--amber)" />
              ))
            )}
          </section>

          <section className="panel flex flex-col p-4">
            <h2 className="label-mono mb-3">Overdue pins</h2>
            {data.overdue.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                Nothing overdue. Nice work.
              </p>
            ) : (
              <ul className="flex flex-col divide-y" style={{ borderColor: "var(--line-soft)" }}>
                {data.overdue.map((o) => (
                  <li key={o.id} className="py-2">
                    <Link
                      href={`/projects/${projectId}/sheets/${o.sheet_id}?pin=${o.id}`}
                      className="flex items-center justify-between gap-2 text-sm hover:text-[var(--amber)]"
                    >
                      <span>{o.title}</span>
                      <span className="label-mono flex-shrink-0" style={{ color: "var(--red)" }}>
                        {o.days_open}d open
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="panel mt-6 flex flex-col p-4">
          <h2 className="label-mono mb-3">Recent activity</h2>
          {data.recent_activity.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
              Nothing to show yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y" style={{ borderColor: "var(--line-soft)" }}>
              {data.recent_activity.map((a, i) => (
                <li key={i} className="py-2">
                  <Link
                    href={`/projects/${projectId}/sheets/${a.sheet_id}?pin=${a.pin_id}`}
                    className="flex items-center justify-between gap-3 text-sm hover:text-[var(--amber)]"
                  >
                    <span>
                      <span style={{ color: "var(--paper-dim)" }}>{a.actor_name}</span> {a.message}
                    </span>
                    <span className="label-mono flex-shrink-0">{timeAgo(a.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
