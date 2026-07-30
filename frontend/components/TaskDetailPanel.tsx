"use client";

import { useEffect, useState } from "react";
import { X, Trash2, Link as LinkIcon } from "lucide-react";
import {
  updateTask,
  deleteTask,
  listTaskComments,
  addTaskComment,
  searchProject,
  ApiError,
  type Task,
  type TaskStatus,
  type ProjectMember,
  type Comment,
  type Attachment,
  type TaskPinRef,
} from "@/lib/api";
import { AttachmentUploader } from "./AttachmentUploader";
import { TaskStatusBadge, PriorityBadge, TASK_STATUS_META, PRIORITY_META } from "./TaskBadges";

interface Props {
  task: Task;
  projectId: number;
  members: ProjectMember[];
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: number) => void;
}

export default function TaskDetailPanel({ task, projectId, members, onClose, onUpdated, onDeleted }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);

  const [comments, setComments] = useState<Comment[]>(task.comments ?? []);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const [attachments, setAttachments] = useState<Attachment[]>(task.attachments ?? []);

  const [pinQuery, setPinQuery] = useState("");
  const [pinResults, setPinResults] = useState<TaskPinRef[]>([]);
  const [searchingPins, setSearchingPins] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local state whenever a different task is opened.
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setComments(task.comments ?? []);
    setAttachments(task.attachments ?? []);
    setPinQuery("");
    setPinResults([]);
  }, [task.id]);

  useEffect(() => {
    listTaskComments(task.id)
      .then(setComments)
      .catch(() => {});
  }, [task.id]);

  async function patch(data: Parameters<typeof updateTask>[2], field: string) {
    setSavingField(field);
    setError(null);
    try {
      const updated = await updateTask(projectId, task.id, data);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that change.");
    } finally {
      setSavingField(null);
    }
  }

  function handleTitleBlur() {
    if (title.trim() && title !== task.title) patch({ title: title.trim() }, "title");
  }

  function handleDescriptionBlur() {
    if (description !== (task.description ?? "")) patch({ description }, "description");
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const comment = await addTaskComment(task.id, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post that comment.");
    } finally {
      setPostingComment(false);
    }
  }

  async function handlePinSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!pinQuery.trim()) return;
    setSearchingPins(true);
    try {
      const res = await searchProject(projectId, pinQuery.trim());
      const linked = new Set(task.related_pins.map((p) => p.id));
      const hits: TaskPinRef[] = res.results
        .filter((h) => !linked.has(h.pin.id))
        .map((h) => ({ id: h.pin.id, title: h.pin.title, sheet_id: h.sheet_id, status: h.pin.status }));
      // de-dupe by pin id
      const seen = new Set<number>();
      setPinResults(hits.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))));
    } finally {
      setSearchingPins(false);
    }
  }

  function addRelatedPin(pin: TaskPinRef) {
    const ids = [...task.related_pins.map((p) => p.id), pin.id];
    patch({ related_pin_ids: ids }, "related_pins");
    setPinResults((prev) => prev.filter((p) => p.id !== pin.id));
  }

  function removeRelatedPin(pinId: number) {
    const ids = task.related_pins.filter((p) => p.id !== pinId).map((p) => p.id);
    patch({ related_pin_ids: ids }, "related_pins");
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteTask(projectId, task.id);
      onDeleted(task.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that task.");
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Backdrop — click to close, doesn't cover the list on wide screens */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.35)" }}
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto"
        style={{ background: "var(--ink-2)", borderLeft: "1px solid var(--line)" }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-2 px-5 py-4"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <input
            className="flex-1 bg-transparent text-lg font-medium outline-none"
            style={{ color: "var(--paper)", fontFamily: "var(--font-display)" }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
          />
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--paper-dim)" }}>
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 px-5 py-4">
          {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}

          {/* Status / Priority */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label-mono mb-1 block">Status</label>
              <select
                className="field text-sm"
                value={task.status}
                disabled={savingField === "status"}
                onChange={(e) => patch({ status: e.target.value as TaskStatus }, "status")}
              >
                {Object.entries(TASK_STATUS_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="label-mono mb-1 block">Priority</label>
              <select
                className="field text-sm"
                value={task.priority}
                disabled={savingField === "priority"}
                onChange={(e) => patch({ priority: e.target.value as any }, "priority")}
              >
                {Object.entries(PRIORITY_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Owner / Due date */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label-mono mb-1 block">Owner</label>
              <select
                className="field text-sm"
                value={task.owner_id ?? ""}
                disabled={savingField === "owner_id"}
                onChange={(e) =>
                  patch({ owner_id: e.target.value ? Number(e.target.value) : null }, "owner_id")
                }
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.user.full_name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="label-mono mb-1 block">Due date</label>
              <input
                type="date"
                className="field text-sm"
                value={task.due_date ? task.due_date.slice(0, 10) : ""}
                disabled={savingField === "due_date"}
                onChange={(e) =>
                  patch({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null }, "due_date")
                }
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label-mono mb-1 block">Description</label>
            <textarea
              className="field text-sm"
              rows={3}
              placeholder="Add more detail…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
            />
          </div>

          {/* Related pins */}
          <div>
            <label className="label-mono mb-1 block">Related pins</label>
            <div className="flex flex-col gap-2">
              {task.related_pins.length === 0 && (
                <p className="text-sm" style={{ color: "var(--paper-dim)" }}>No pins linked yet.</p>
              )}
              {task.related_pins.map((pin) => (
                <div
                  key={pin.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm"
                  style={{ border: "1px solid var(--line-soft)" }}
                >
                  <span className="flex items-center gap-1.5">
                    <LinkIcon size={13} style={{ color: "var(--paper-dim)" }} />
                    {pin.title}
                  </span>
                  <button
                    onClick={() => removeRelatedPin(pin.id)}
                    className="label-mono"
                    style={{ color: "var(--red)" }}
                  >
                    Unlink
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handlePinSearch} className="mt-2 flex gap-2">
              <input
                className="field text-sm"
                placeholder="Search pins to link…"
                value={pinQuery}
                onChange={(e) => setPinQuery(e.target.value)}
              />
              <button type="submit" className="btn-ghost text-sm" disabled={searchingPins}>
                {searchingPins ? "…" : "Search"}
              </button>
            </form>
            {pinResults.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {pinResults.map((pin) => (
                  <button
                    key={pin.id}
                    onClick={() => addRelatedPin(pin)}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors"
                    style={{ border: "1px solid var(--line-soft)" }}
                  >
                    <span>{pin.title}</span>
                    <span className="label-mono" style={{ color: "var(--amber)" }}>+ Link</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <label className="label-mono mb-1 block">Photos & attachments</label>
            {attachments.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.file_path}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded"
                    style={{ border: "1px solid var(--line-soft)", aspectRatio: "1" }}
                  >
                    <img src={a.file_path} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <AttachmentUploader
              taskId={task.id}
              onUploaded={(a) => setAttachments((prev) => [...prev, a])}
            />
          </div>

          {/* Comments */}
          <div className="flex-1">
            <label className="label-mono mb-1 block">Comments</label>
            <div className="flex flex-col gap-3">
              {comments.map((c) => (
                <div key={c.id} className="text-sm">
                  <p className="label-mono" style={{ color: "var(--paper-dim)" }}>
                    {c.author?.full_name ?? "Someone"} · {new Date(c.created_at).toLocaleString()}
                  </p>
                  <p style={{ color: "var(--paper)" }}>{c.body}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-sm" style={{ color: "var(--paper-dim)" }}>No comments yet.</p>
              )}
            </div>
            <form onSubmit={handlePostComment} className="mt-3 flex flex-col gap-2">
              <textarea
                className="field text-sm"
                rows={2}
                placeholder="Add a comment…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button type="submit" className="btn-ghost self-start text-sm" disabled={postingComment}>
                {postingComment ? "Posting…" : "Post comment"}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <span className="flex items-center gap-3">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="label-mono flex items-center gap-1"
            style={{ color: "var(--red)" }}
          >
            <Trash2 size={14} />
            {deleting ? "Deleting…" : "Delete task"}
          </button>
        </div>
      </aside>
    </>
  );
}
