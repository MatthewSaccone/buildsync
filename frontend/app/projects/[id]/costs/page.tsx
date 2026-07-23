"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import ProjectTabs from "@/components/ProjectTabs";
import { useAuth } from "@/lib/auth";
import {
  getProjectCostSummary,
  materialsCsvExportUrl,
  getProject,
  getToken,
  type ProjectCostSummary,
  type PinStatus,
  type Project,
} from "@/lib/api";

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

const STATUS_OPTIONS: { value: PinStatus | "all"; label: string }[] = [
  { value: "all", label: "All pins" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "resolved", label: "Resolved" },
  { value: "verified", label: "Verified" },
];

export default function ProjectCostsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ProjectCostSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<PinStatus | "all">("all");
  const [fetching, setFetching] = useState(true);

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
    getProjectCostSummary(projectId, statusFilter === "all" ? undefined : statusFilter)
      .then(setSummary)
      .finally(() => setFetching(false));
  }, [user, projectId, statusFilter]);

  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const url = materialsCsvExportUrl(projectId, statusFilter === "all" ? undefined : statusFilter);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `project-${projectId}-materials.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setExporting(false);
    }
  }

  if (loading || !user || !project) return <PageLoader />;

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <Link href={`/projects/${projectId}`} className="label-mono mb-4 inline-block" style={{ color: "var(--amber)" }}>
          ← Back to project
        </Link>

        <ProjectTabs projectId={projectId} />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}>Materials cost</h1>
            <p className="label-mono mt-1">{project.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="field"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PinStatus | "all")}
              style={{ width: "auto" }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button onClick={handleExport} disabled={exporting} className="btn-primary">
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        {fetching || !summary ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="panel h-12 animate-pulse" style={{ opacity: 0.5 }} />
            ))}
          </div>
        ) : summary.lines.length === 0 ? (
          <div className="panel px-6 py-16 text-center" style={{ color: "var(--paper-dim)" }}>
            No materials attached to any pins yet.
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th className="label-mono px-4 py-3 text-left">Material</th>
                  <th className="label-mono px-4 py-3 text-left">Size</th>
                  <th className="label-mono px-4 py-3 text-right">Qty</th>
                  <th className="label-mono px-4 py-3 text-right">Unit price</th>
                  <th className="label-mono px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.lines.map((line) => (
                  <tr key={line.material_variant_id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                    <td className="px-4 py-3">
                      <p>{line.material_name}</p>
                      {line.material_category && <p className="label-mono">{line.material_category}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {line.size}
                      {line.unit ? ` (${line.unit})` : ""}
                    </td>
                    <td className="px-4 py-3 text-right">{line.total_quantity}</td>
                    <td className="px-4 py-3 text-right">{formatPrice(line.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatPrice(line.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="label-mono px-4 py-3 text-right">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-lg font-semibold" style={{ color: "var(--amber)" }}>
                    {formatPrice(summary.total_cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
