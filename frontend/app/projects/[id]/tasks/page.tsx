"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import {
  listTasks,
  createTask,
  updateTask,
  listMembers,
  ApiError,
  type Task,
  type TaskStatus,
  type ProjectMember,
} from "@/lib/api";
import { TaskStatusBadge, PriorityBadge } from "@/components/TaskBadges";
import TaskDetailPanel from "@/components/TaskDetailPanel";

const STATUS_FILTERS: { key: TaskStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

export default function ProjectTasksPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      listTasks(projectId, statusFilter === "all" ? undefined : { status: statusFilter }),
      listMembers(projectId),
    ])
      .then(([t, m]) => {
        setTasks(t);
        setMembers(m);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load tasks."))
      .finally(() => setLoading(false));
  }, [projectId, statusFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const task = await createTask(projectId, { title: newTitle.trim() });
      setTasks((prev) => [task, ...prev]);
      setNewTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that task.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleDone(task: Task) {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    // optimistic update
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      const updated = await updateTask(projectId, task.id, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      // revert on failure
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  }

  function handleUpdated(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleDeleted(taskId: number) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTaskId(null);
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--paper-dim)" }}>Loading tasks…</p>;
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className="label-mono rounded px-2.5 py-1 text-xs transition-colors"
            style={{
              color: statusFilter === f.key ? "var(--ink-2)" : "var(--paper-dim)",
              background: statusFilter === f.key ? "var(--amber)" : "transparent",
              border: "1px solid var(--line-soft)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}

      {/* Quick add */}
      <form onSubmit={handleCreate} className="panel mb-4 flex items-center gap-2 p-3">
        <Plus size={16} style={{ color: "var(--paper-dim)" }} />
        <input
          className="field flex-1 text-sm"
          style={{ border: "none", background: "transparent" }}
          placeholder="Add a task — e.g. Order concrete"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit" className="btn-ghost text-sm" disabled={creating || !newTitle.trim()}>
          {creating ? "Adding…" : "Add"}
        </button>
      </form>

      {/* Task list */}
      <div className="panel flex flex-col">
        {tasks.length === 0 && (
          <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--paper-dim)" }}>
            No tasks yet. Add your first one above.
          </p>
        )}
        {tasks.map((task, i) => (
          <div
            key={task.id}
            onClick={() => setSelectedTaskId(task.id)}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors"
            style={{
              borderTop: i === 0 ? "none" : "1px solid var(--line-soft)",
            }}
          >
            <input
              type="checkbox"
              checked={task.status === "done"}
              onClick={(e) => e.stopPropagation()}
              onChange={() => handleToggleDone(task)}
              className="h-4 w-4 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm"
                style={{
                  color: task.status === "done" ? "var(--paper-dim)" : "var(--paper)",
                  textDecoration: task.status === "done" ? "line-through" : "none",
                }}
              >
                {task.title}
              </p>
              <p className="label-mono mt-0.5" style={{ color: "var(--paper-dim)" }}>
                {task.owner ? task.owner.full_name : "Unassigned"}
                {task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString()}` : ""}
                {task.related_pins.length > 0 ? ` · ${task.related_pins.length} pin${task.related_pins.length > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            <div className="hidden shrink-0 items-center gap-3 sm:flex">
              <PriorityBadge priority={task.priority} />
              {task.status !== "done" && <TaskStatusBadge status={task.status} />}
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          projectId={projectId}
          members={members}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
