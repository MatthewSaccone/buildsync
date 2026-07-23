"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import ProjectTabs from "@/components/ProjectTabs";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listProjectPins,
  type Project,
  type Pin,
  type PinStatus,
  type UserRole,
} from "@/lib/api";

const STATUS_LABEL: Record<PinStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  resolved: "Resolved",
  verified: "Verified",
};

const STATUS_COLOR: Record<PinStatus, string> = {
  open: "var(--blue)",
  in_progress: "var(--amber)",
  blocked: "var(--red)",
  resolved: "var(--green)",
  verified: "var(--green)",
};

const STATUSES: PinStatus[] = ["open", "in_progress", "blocked", "resolved", "verified"];
const TRADES: UserRole[] = [
  "architect",
  "builder",
  "general_contractor",
  "electrician",
  "plumber",
  "hvac",
  "framer",
  "owner",
  "other",
];

function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function ProjectPinsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [fetching, setFetching] = useState(true);

  const [statusFilter, setStatusFilter] = useState<PinStatus | "all">("all");
  const [tradeFilter, setTradeFilter] = useState<UserRole | "all">("all");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    getProject(projectId).then(setProject);
  }, [user, projectId]);

  useEffect(() => {
    if (!user || !projectId) return;
    setFetching(true);
    listProjectPins(projectId, {
      status: statusFilter === "all" ? undefined : statusFilter,
      trade: tradeFilter === "all" ? undefined : tradeFilter,
    })
      .then(setPins)
      .finally(() => setFetching(false));
  }, [user, projectId, statusFilter, tradeFilter]);

  const totalCost = useMemo(() => pins.reduce((sum, p) => sum + p.total_cost, 0), [pins]);

  if (loading || !user || !project) return <PageLoader />;

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <Link href={`/projects/${projectId}`} className="label-mono mb-4 inline-block" style={{ color: "var(--amber)" }}>
          ← Back to project
        </Link>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.7rem" }}>{project.name}</h1>
            <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
              All pins across every sheet
            </p>
          </div>
        </div>

        <ProjectTabs projectId={projectId} />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            className="field"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PinStatus | "all")}
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            className="field"
            style={{ width: "auto" }}
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value as UserRole | "all")}
          >
            <option value="all">All trades</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <span className="label-mono ml-auto">
            {pins.length} pin{pins.length === 1 ? "" : "s"} · {formatPrice(totalCost)} in materials
          </span>
        </div>

        {fetching ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="panel h-12 animate-pulse" style={{ opacity: 0.5 }} />
            ))}
          </div>
        ) : pins.length === 0 ? (
          <div className="panel px-5 py-10 text-center text-sm" style={{ color: "var(--paper-dim)" }}>
            No pins match these filters.
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="label-mono text-left" style={{ borderBottom: "1px solid var(--line)" }}>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Trade</th>
                  <th className="px-3 py-2">Materials cost</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {pins.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                    <td className="px-3 py-2">
                      <Link href={`/projects/${projectId}/sheets/${p.sheet_id}?pin=${p.id}`} className="hover:text-[var(--amber)]">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="label-mono" style={{ color: STATUS_COLOR[p.status] }}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 capitalize">{p.priority}</td>
                    <td className="px-3 py-2 capitalize">{p.trade ? p.trade.replace(/_/g, " ") : "—"}</td>
                    <td className="px-3 py-2">{formatPrice(p.total_cost)}</td>
                    <td className="px-3 py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
