"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { listDailyLogs, createDailyLog, ApiError, type DailyLog } from "@/lib/api";
import DailyLogDetailPanel from "@/components/DailyLogDetailPanel";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProjectDailyLogsPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    listDailyLogs(projectId)
      .then(setLogs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load daily logs."))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleCreateToday() {
    setCreating(true);
    setError(null);
    try {
      const log = await createDailyLog(projectId, { log_date: todayISO() });
      setLogs((prev) => [log, ...prev]);
      setSelectedLogId(log.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create today's log.");
    } finally {
      setCreating(false);
    }
  }

  function handleUpdated(updated: DailyLog) {
    setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  function handleDeleted(logId: number) {
    setLogs((prev) => prev.filter((l) => l.id !== logId));
    setSelectedLogId(null);
  }

  const selectedLog = logs.find((l) => l.id === selectedLogId) ?? null;
  const hasToday = logs.some((l) => l.log_date === todayISO());

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--paper-dim)" }}>Loading daily logs…</p>;
  }

  return (
    <div>
      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}

      {/* Quick add */}
      <div className="panel mb-4 flex items-center justify-between gap-2 p-3">
        <div>
          <p className="text-sm" style={{ color: "var(--paper)" }}>Site report, photos, crew, and delays for the day.</p>
        </div>
        <button
          onClick={handleCreateToday}
          disabled={creating || hasToday}
          className="btn-ghost flex items-center gap-1 text-sm"
          title={hasToday ? "Today's log already exists" : "Start today's log"}
        >
          <Plus size={16} />
          {creating ? "Creating…" : hasToday ? "Today's log added" : "Start today's log"}
        </button>
      </div>

      {/* Log list */}
      <div className="panel flex flex-col">
        {logs.length === 0 && (
          <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--paper-dim)" }}>
            No daily logs yet. Start today&apos;s log above.
          </p>
        )}
        {logs.map((log, i) => (
          <div
            key={log.id}
            onClick={() => setSelectedLogId(log.id)}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--line-soft)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm" style={{ color: "var(--paper)" }}>
                {new Date(log.log_date + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <p className="label-mono mt-0.5" style={{ color: "var(--paper-dim)" }}>
                {log.created_by.full_name}
                {log.weather ? ` · ${log.weather}` : ""}
                {log.hours_worked ? ` · ${log.hours_worked}h` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selectedLog && (
        <DailyLogDetailPanel
          log={selectedLog}
          projectId={projectId}
          onClose={() => setSelectedLogId(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
