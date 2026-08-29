"use client";

import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import {
  updateDailyLog,
  deleteDailyLog,
  listDailyLogAttachments,
  ApiError,
  type DailyLog,
  type Attachment,
} from "@/lib/api";
import { AttachmentUploader } from "./AttachmentUploader";
import { PhotoGrid } from "./PhotoGrid";

interface Props {
  log: DailyLog;
  projectId: number;
  onClose: () => void;
  onUpdated: (log: DailyLog) => void;
  onDeleted: (logId: number) => void;
}

const FIELDS: { key: keyof DailyLog; label: string; placeholder: string }[] = [
  { key: "weather", label: "Weather", placeholder: "e.g. Light rain AM, cleared by noon" },
  { key: "crew", label: "Crew on site", placeholder: "Who worked today" },
  { key: "completed_work", label: "Work completed", placeholder: "What got done" },
  { key: "delays", label: "Delays", placeholder: "Anything that held things up" },
  { key: "visitors", label: "Visitors", placeholder: "Inspectors, clients, etc." },
  { key: "safety_notes", label: "Safety notes", placeholder: "Incidents, near misses, reminders" },
];

export default function DailyLogDetailPanel({ log, projectId, onClose, onUpdated, onDeleted }: Props) {
  const [fields, setFields] = useState<Record<string, string>>({
    weather: log.weather ?? "",
    crew: log.crew ?? "",
    completed_work: log.completed_work ?? "",
    delays: log.delays ?? "",
    visitors: log.visitors ?? "",
    safety_notes: log.safety_notes ?? "",
  });
  const [hoursWorked, setHoursWorked] = useState(log.hours_worked?.toString() ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFields({
      weather: log.weather ?? "",
      crew: log.crew ?? "",
      completed_work: log.completed_work ?? "",
      delays: log.delays ?? "",
      visitors: log.visitors ?? "",
      safety_notes: log.safety_notes ?? "",
    });
    setHoursWorked(log.hours_worked?.toString() ?? "");
    setLoadingPhotos(true);
    listDailyLogAttachments(log.id)
      .then(setAttachments)
      .catch(() => {})
      .finally(() => setLoadingPhotos(false));
  }, [log.id]);

  async function patch(data: Record<string, unknown>, field: string) {
    setSavingField(field);
    setError(null);
    try {
      const updated = await updateDailyLog(projectId, log.id, data);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that change.");
    } finally {
      setSavingField(null);
    }
  }

  function handleFieldBlur(key: string) {
    const value = fields[key];
    const original = ((log as unknown as Record<string, string | null>)[key]) ?? "";
    if (value !== original) {
      patch({ [key]: value.trim() ? value : null }, key);
    }
  }

  function handleHoursBlur() {
    const parsed = hoursWorked.trim() === "" ? null : Number(hoursWorked);
    if (parsed !== log.hours_worked) {
      patch({ hours_worked: parsed }, "hours_worked");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this daily log? This can't be undone.")) return;
    setDeleting(true);
    try {
      await deleteDailyLog(projectId, log.id);
      onDeleted(log.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete this log.");
      setDeleting(false);
    }
  }

  function handleAttachmentUpdated(updated: Attachment) {
    setAttachments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto"
        style={{ background: "var(--ink-2)", borderLeft: "1px solid var(--line)" }}
      >
        <div className="flex items-start justify-between gap-2 px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <p className="text-lg font-medium" style={{ color: "var(--paper)", fontFamily: "var(--font-display)" }}>
            {new Date(log.log_date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} disabled={deleting} aria-label="Delete log" style={{ color: "var(--paper-dim)" }}>
              <Trash2 size={18} />
            </button>
            <button onClick={onClose} aria-label="Close" style={{ color: "var(--paper-dim)" }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 px-5 py-4">
          {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}

          <div>
            <label className="label-mono mb-1 block">Hours worked</label>
            <input
              className="field w-full text-sm"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={hoursWorked}
              onChange={(e) => setHoursWorked(e.target.value)}
              onBlur={handleHoursBlur}
              disabled={savingField === "hours_worked"}
            />
          </div>

          {FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="label-mono mb-1 block">{label}</label>
              <textarea
                className="field w-full text-sm"
                rows={key === "weather" ? 1 : 2}
                placeholder={placeholder}
                value={fields[key]}
                onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => handleFieldBlur(key)}
                disabled={savingField === key}
              />
            </div>
          ))}

          {/* Progress photos */}
          <div>
            <label className="label-mono mb-1 block">Progress photos</label>
            {!loadingPhotos && attachments.length > 0 && (
              <div className="mb-2">
                <PhotoGrid
                  projectId={projectId}
                  attachments={attachments}
                  onUpdated={handleAttachmentUpdated}
                  onAttached={() => {}}
                />
              </div>
            )}
            <AttachmentUploader
              dailyLogId={log.id}
              onUploaded={(a) => setAttachments((prev) => [...prev, a])}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
