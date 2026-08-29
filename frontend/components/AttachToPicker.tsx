"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  listProjectPins,
  listTasks,
  attachExistingAttachment,
  ApiError,
  type Attachment,
  type Pin,
  type Task,
} from "@/lib/api";

interface Props {
  projectId: number;
  attachment: Attachment;
  onClose: () => void;
  onAttached: (copy: Attachment) => void;
}

/** Lets someone pick a task or a pin to attach an existing photo to
 * (BS-302-3 / BS-302-4) -- e.g. pulling a progress photo from a daily log
 * onto the task or pin it documents. */
export function AttachToPicker({ projectId, attachment, onClose, onAttached }: Props) {
  const [mode, setMode] = useState<"task" | "pin">("task");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [attachingId, setAttachingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([listTasks(projectId), listProjectPins(projectId)])
      .then(([t, p]) => {
        setTasks(t);
        setPins(p);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load tasks and pins."))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handlePick(target: { taskId?: number; pinId?: number }) {
    const id = target.taskId ?? target.pinId!;
    setAttachingId(id);
    setError(null);
    try {
      const copy = await attachExistingAttachment(attachment.id, target);
      onAttached(copy);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't attach that photo.");
    } finally {
      setAttachingId(null);
    }
  }

  const filteredTasks = tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()));
  const filteredPins = pins.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded"
        style={{ background: "var(--ink-2)", border: "1px solid var(--line)", maxHeight: "70vh" }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--paper)" }}>Attach photo to…</p>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--paper-dim)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          <button
            className="label-mono rounded px-2.5 py-1 text-xs transition-colors"
            style={{
              color: mode === "task" ? "var(--ink-2)" : "var(--paper-dim)",
              background: mode === "task" ? "var(--amber)" : "transparent",
              border: "1px solid var(--line-soft)",
            }}
            onClick={() => setMode("task")}
          >
            Task
          </button>
          <button
            className="label-mono rounded px-2.5 py-1 text-xs transition-colors"
            style={{
              color: mode === "pin" ? "var(--ink-2)" : "var(--paper-dim)",
              background: mode === "pin" ? "var(--amber)" : "transparent",
              border: "1px solid var(--line-soft)",
            }}
            onClick={() => setMode("pin")}
          >
            Pin
          </button>
        </div>

        <div className="px-4 pt-3">
          <input
            className="field w-full text-sm"
            placeholder={mode === "task" ? "Search tasks…" : "Search pins…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && (
          <p className="px-4 pt-2 text-sm" style={{ color: "var(--red)" }}>
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <p className="px-2 py-3 text-sm" style={{ color: "var(--paper-dim)" }}>
              Loading…
            </p>
          )}

          {!loading && mode === "task" && filteredTasks.length === 0 && (
            <p className="px-2 py-3 text-sm" style={{ color: "var(--paper-dim)" }}>
              No matching tasks.
            </p>
          )}
          {!loading &&
            mode === "task" &&
            filteredTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => handlePick({ taskId: t.id })}
                disabled={attachingId === t.id}
                className="block w-full rounded px-2 py-2 text-left text-sm transition-colors"
                style={{ color: "var(--paper)" }}
              >
                {attachingId === t.id ? "Attaching…" : t.title}
              </button>
            ))}

          {!loading && mode === "pin" && filteredPins.length === 0 && (
            <p className="px-2 py-3 text-sm" style={{ color: "var(--paper-dim)" }}>
              No matching pins.
            </p>
          )}
          {!loading &&
            mode === "pin" &&
            filteredPins.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePick({ pinId: p.id })}
                disabled={attachingId === p.id}
                className="block w-full rounded px-2 py-2 text-left text-sm transition-colors"
                style={{ color: "var(--paper)" }}
              >
                {attachingId === p.id ? "Attaching…" : p.title}
              </button>
            ))}
        </div>
      </div>
    </>
  );
}
