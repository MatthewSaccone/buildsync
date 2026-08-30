"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listActivity,
  listMembers,
  connectProjectSocket,
  type Project,
  type ProjectMember,
  type ActivityEvent,
  type ActivityKind,
} from "@/lib/api";

const KIND_LABEL: Record<string, string> = {
  pin_created: "Pin opened",
  comment_added: "Comment",
  task_completed: "Task completed",
  cost_added: "Cost added",
  sheet_uploaded: "Sheet uploaded",
  chat_message: "Chat",
  member_joined: "Team",
  daily_log_created: "Daily log",
};

const KIND_COLOR: Record<string, string> = {
  pin_created: "var(--blue)",
  comment_added: "var(--paper-dim)",
  task_completed: "var(--green)",
  cost_added: "var(--gold)",
  sheet_uploaded: "var(--teal)",
  chat_message: "var(--paper-dim)",
  member_joined: "var(--amber)",
  daily_log_created: "var(--teal)",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** A pin-scoped event carries {pin_id, sheet_id} in `extra` — link straight
 * to that sheet. Everything else (tasks, chat, materials-on-tasks, member
 * joins) has no single-page deep link yet, so it renders as plain text. */
function activityLink(projectId: number, a: ActivityEvent): string | null {
  const sheetId = a.extra?.sheet_id;
  if (typeof sheetId === "number") {
    return `/projects/${projectId}/sheets/${sheetId}`;
  }
  return null;
}

const PAGE_SIZE = 30;
const ALL_KINDS = Object.keys(KIND_LABEL);

export default function ProjectActivityPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Filters (BS-202): activity type, user, date range, and free-text search.
  const [kindFilter, setKindFilter] = useState<ActivityKind | "all">("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const seenIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    getProject(projectId).then(setProject);
    listMembers(projectId).then(setMembers);
  }, [user, projectId]);

  // Debounce the search box so we're not hitting the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const activeFilters = {
    kind: kindFilter === "all" ? undefined : kindFilter,
    actorId: actorFilter === "all" ? undefined : Number(actorFilter),
    startDate: startDate ? new Date(startDate).toISOString() : undefined,
    // Make the end date inclusive of the whole day.
    endDate: endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : undefined,
    q: search || undefined,
  };
  const filtersKey = JSON.stringify(activeFilters);

  // Re-fetch from scratch whenever a filter changes.
  useEffect(() => {
    if (!user || !projectId) return;
    let cancelled = false;
    setFetching(true);
    listActivity(projectId, { limit: PAGE_SIZE, ...activeFilters })
      .then((items) => {
        if (cancelled) return;
        setEvents(items);
        seenIds.current = new Set(items.map((i) => i.id));
        setHasMore(items.length === PAGE_SIZE);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId, filtersKey]);

  // Live updates: new events stream straight into the top of the list, but
  // only when they'd match the filters currently applied.
  useEffect(() => {
    if (!user || !projectId) return;
    const ws = connectProjectSocket(projectId, (msg) => {
      if (msg.event === "activity_created" && msg.activity) {
        const activity: ActivityEvent = msg.activity;
        if (seenIds.current.has(activity.id)) return;
        if (activeFilters.kind && activity.kind !== activeFilters.kind) return;
        if (activeFilters.actorId && activity.actor_id !== activeFilters.actorId) return;
        if (activeFilters.q && !activity.message.toLowerCase().includes(activeFilters.q.toLowerCase())) return;
        if (activeFilters.startDate && activity.created_at < activeFilters.startDate) return;
        if (activeFilters.endDate && activity.created_at > activeFilters.endDate) return;
        seenIds.current.add(activity.id);
        setEvents((prev) => [activity, ...prev]);
      }
    });
    return () => ws?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId, filtersKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || events.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = events[events.length - 1];
      const more = await listActivity(projectId, {
        before: oldest.created_at,
        limit: PAGE_SIZE,
        ...activeFilters,
      });
      const fresh = more.filter((i) => !seenIds.current.has(i.id));
      fresh.forEach((i) => seenIds.current.add(i.id));
      setEvents((prev) => [...prev, ...fresh]);
      setHasMore(more.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, loadingMore, projectId, filtersKey]);

  if (loading || !user || !project) return <PageLoader />;

  const visible = events;
  const hasActiveFilters =
    kindFilter !== "all" || actorFilter !== "all" || !!startDate || !!endDate || !!search;

  const clearFilters = () => {
    setKindFilter("all");
    setActorFilter("all");
    setStartDate("");
    setEndDate("");
    setSearchInput("");
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}>Activity</h1>
          <p className="label-mono mt-1">{project.name}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="label-mono" style={{ fontSize: "0.7rem" }}>Search</label>
          <input
            type="text"
            className="field"
            style={{ width: "16rem" }}
            placeholder="Search activity…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="label-mono" style={{ fontSize: "0.7rem" }}>User</label>
          <select
            className="field"
            style={{ width: "auto" }}
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
          >
            <option value="all">All users</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="label-mono" style={{ fontSize: "0.7rem" }}>Type</label>
          <select
            className="field"
            style={{ width: "auto" }}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as ActivityKind | "all")}
          >
            <option value="all">All activity</option>
            {ALL_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k] ?? k}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="label-mono" style={{ fontSize: "0.7rem" }}>From</label>
          <input
            type="date"
            className="field"
            style={{ width: "auto" }}
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="label-mono" style={{ fontSize: "0.7rem" }}>To</label>
          <input
            type="date"
            className="field"
            style={{ width: "auto" }}
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="btn-ghost text-sm">
            Clear filters
          </button>
        )}
      </div>

      {fetching ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel h-14 animate-pulse" style={{ opacity: 0.5 }} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="panel px-6 py-16 text-center" style={{ color: "var(--paper-dim)" }}>
          {hasActiveFilters
            ? "No activity matches these filters."
            : "Nothing here yet. As pins, tasks, sheets, costs, and chat activity happen on this project, they'll show up here in real time."}
        </div>
      ) : (
        <div className="panel flex flex-col" style={{ overflow: "hidden" }}>
          {visible.map((a) => {
            const href = activityLink(projectId, a);
            const content = (
              <>
                <span
                  className="label-mono shrink-0"
                  style={{
                    color: KIND_COLOR[a.kind] ?? "var(--paper-dim)",
                    width: "9.5rem",
                  }}
                >
                  {KIND_LABEL[a.kind] ?? a.kind}
                </span>
                <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--paper)" }}>
                  {a.message}
                </span>
                <span className="label-mono shrink-0" style={{ color: "var(--paper-dim)" }}>
                  {timeAgo(a.created_at)}
                </span>
              </>
            );
            const rowClass = "flex items-center gap-3 px-4 py-3 text-left";
            const rowStyle = { borderBottom: "1px solid var(--line-soft)" };
            return href ? (
              <Link key={a.id} href={href} className={`${rowClass} hover:opacity-80`} style={rowStyle}>
                {content}
              </Link>
            ) : (
              <div key={a.id} className={rowClass} style={rowStyle}>
                {content}
              </div>
            );
          })}
        </div>
      )}

      {!fetching && hasMore && visible.length > 0 && (
        <div className="mt-4 flex justify-center">
          <button onClick={loadMore} disabled={loadingMore} className="btn-ghost text-sm">
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
