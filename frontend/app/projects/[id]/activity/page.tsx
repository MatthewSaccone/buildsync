"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listActivity,
  connectProjectSocket,
  type Project,
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
};

const KIND_COLOR: Record<string, string> = {
  pin_created: "var(--blue)",
  comment_added: "var(--paper-dim)",
  task_completed: "var(--green)",
  cost_added: "var(--gold)",
  sheet_uploaded: "var(--teal)",
  chat_message: "var(--paper-dim)",
  member_joined: "var(--amber)",
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

export default function ProjectActivityPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [kindFilter, setKindFilter] = useState<ActivityKind | "all">("all");

  const seenIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    getProject(projectId).then(setProject);
  }, [user, projectId]);

  useEffect(() => {
    if (!user || !projectId) return;
    let cancelled = false;
    listActivity(projectId, { limit: PAGE_SIZE })
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
  }, [user, projectId]);

  // Live updates: new events stream straight into the top of the list.
  useEffect(() => {
    if (!user || !projectId) return;
    const ws = connectProjectSocket(projectId, (msg) => {
      if (msg.event === "activity_created" && msg.activity) {
        const activity: ActivityEvent = msg.activity;
        if (seenIds.current.has(activity.id)) return;
        seenIds.current.add(activity.id);
        setEvents((prev) => [activity, ...prev]);
      }
    });
    return () => ws?.close();
  }, [user, projectId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || events.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = events[events.length - 1];
      const more = await listActivity(projectId, { before: oldest.created_at, limit: PAGE_SIZE });
      const fresh = more.filter((i) => !seenIds.current.has(i.id));
      fresh.forEach((i) => seenIds.current.add(i.id));
      setEvents((prev) => [...prev, ...fresh]);
      setHasMore(more.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [events, loadingMore, projectId]);

  if (loading || !user || !project) return <PageLoader />;

  const visible = kindFilter === "all" ? events : events.filter((e) => e.kind === kindFilter);
  const availableKinds = Array.from(new Set(events.map((e) => e.kind)));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}>Activity</h1>
          <p className="label-mono mt-1">{project.name}</p>
        </div>
        {availableKinds.length > 1 && (
          <select
            className="field"
            style={{ width: "auto" }}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as ActivityKind | "all")}
          >
            <option value="all">All activity</option>
            {availableKinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k] ?? k}
              </option>
            ))}
          </select>
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
          Nothing here yet. As pins, tasks, sheets, costs, and chat activity happen on this
          project, they&rsquo;ll show up here in real time.
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
