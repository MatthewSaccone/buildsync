"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listProjectPins,
  searchProject,
  type Project,
  type Pin,
  type PinStatus,
  type UserRole,
  type SearchResults,
} from "@/lib/api";

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

type SortKey = "created_at" | "title" | "status" | "priority" | "total_cost";

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, { style: "currency", currency: "USD" });
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
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

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

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchProject(projectId, searchQuery.trim());
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedPins = useMemo(() => {
    const copy = [...pins];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "created_at") cmp = a.created_at.localeCompare(b.created_at);
      else if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "priority") cmp = a.priority.localeCompare(b.priority);
      else if (sortKey === "total_cost") cmp = a.total_cost - b.total_cost;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [pins, sortKey, sortDir]);

  if (loading || !user || !project) return <PageLoader />;

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="label-mono cursor-pointer select-none px-4 py-3 text-left"
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <Link href={`/projects/${projectId}`} className="label-mono mb-4 inline-block" style={{ color: "var(--amber)" }}>
          ← Back to project
        </Link>
        <h1 className="mb-1" style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}>
          All pins
        </h1>
        <p className="label-mono mb-6">{project.name}</p>

        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <input
            className="field"
            placeholder="Search pin titles and comments…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="btn-ghost">
            {searching ? "…" : "Search"}
          </button>
          {searchResults && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSearchQuery("");
                setSearchResults(null);
              }}
            >
              Clear
            </button>
          )}
        </form>

        {searchResults ? (
          <div className="panel overflow-hidden">
            {searchResults.results.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--paper-dim)" }}>
                No matches for &ldquo;{searchQuery}&rdquo;.
              </p>
            ) : (
              searchResults.results.map((r, i) => (
                <Link
                  key={i}
                  href={`/projects/${projectId}/sheets/${r.sheet_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:opacity-80"
                  style={{ borderBottom: "1px solid var(--line-soft)" }}
                >
                  <div>
                    <span className="label-mono mr-2">{r.type === "pin" ? "PIN" : "COMMENT"}</span>
                    <span>{r.type === "pin" ? r.snippet : `${r.pin.title}: ${r.snippet}`}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <select
                className="field"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as PinStatus | "all")}
                style={{ width: "auto" }}
              >
                <option value="all">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <select
                className="field"
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value as UserRole | "all")}
                style={{ width: "auto" }}
              >
                <option value="all">All trades</option>
                {TRADES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            {fetching ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="panel h-12 animate-pulse" style={{ opacity: 0.5 }} />
                ))}
              </div>
            ) : sortedPins.length === 0 ? (
              <div className="panel px-6 py-16 text-center" style={{ color: "var(--paper-dim)" }}>
                No pins match these filters.
              </div>
            ) : (
              <div className="panel overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line)" }}>
                      <SortHeader label="Title" k="title" />
                      <SortHeader label="Status" k="status" />
                      <SortHeader label="Priority" k="priority" />
                      <th className="label-mono px-4 py-3 text-left">Trade</th>
                      <SortHeader label="Materials" k="total_cost" />
                      <SortHeader label="Created" k="created_at" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPins.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                        <td className="px-4 py-3">
                          <Link href={`/projects/${projectId}/sheets/${p.sheet_id}`} className="hover:opacity-80">
                            {p.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} size={13} />
                        </td>
                        <td className="px-4 py-3" style={{ textTransform: "capitalize" }}>
                          {p.priority}
                        </td>
                        <td className="px-4 py-3" style={{ textTransform: "capitalize" }}>
                          {p.trade ? p.trade.replace(/_/g, " ") : "—"}
                        </td>
                        <td className="px-4 py-3">{p.total_cost > 0 ? formatPrice(p.total_cost) : "—"}</td>
                        <td className="px-4 py-3 label-mono">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
