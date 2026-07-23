"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import {
  listSheets,
  listPins,
  createPin,
  updatePin,
  deletePin,
  listComments,
  addComment,
  listMembers,
  connectProjectSocket,
  sheetImageUrl,
  attachmentUrl,
  ApiError,
  type Sheet,
  type Pin,
  type PinStatus,
  type Comment,
  type ProjectMember,
  type UserRole,
} from "@/lib/api";

const STATUS_COLOR: Record<PinStatus, string> = {
  open: "var(--blue)",
  in_progress: "var(--amber)",
  blocked: "var(--red)",
  resolved: "var(--green)",
  verified: "var(--green)",
};

const STATUS_LABEL: Record<PinStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  resolved: "Resolved",
  verified: "Verified",
};

const STATUSES: PinStatus[] = ["open", "in_progress", "blocked", "resolved", "verified"];
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
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

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function SheetViewerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string; sheetId: string }>();
  const searchParams = useSearchParams();
  const projectId = Number(params.id);
  const sheetId = Number(params.sheetId);

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<PinStatus | "all">("all");
  const [tradeFilter, setTradeFilter] = useState<UserRole | "all">("all");

  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTrade, setDraftTrade] = useState<UserRole | "">("");
  const [draftPriority, setDraftPriority] = useState<string>("normal");
  const [draftAssignee, setDraftAssignee] = useState<number | "">("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);

  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  const [editingDetails, setEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editTrade, setEditTrade] = useState<UserRole | "">("");
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const imgRef = useRef<HTMLDivElement>(null);
  const selectedPinIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedPinIdRef.current = selectedPinId;
  }, [selectedPinId]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId || !sheetId) return;
    setFetching(true);
    setLoadError(null);
    Promise.all([listSheets(projectId), listPins(sheetId), listMembers(projectId)])
      .then(([sheets, pinList, memberList]) => {
        const found = sheets.find((s) => s.id === sheetId) ?? null;
        setSheet(found);
        setPins(pinList);
        setMembers(memberList);

        // Deep link from dashboard/search/pins-table (?pin=123)
        const pinParam = searchParams.get("pin");
        if (pinParam) {
          const target = pinList.find((p) => p.id === Number(pinParam));
          if (target) setSelectedPinId(target.id);
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load this sheet."))
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId, sheetId]);

  // Live updates over the project's websocket channel
  useEffect(() => {
    if (!user || !projectId) return;
    const ws = connectProjectSocket(projectId, (msg) => {
      if (msg.event === "pin_created" && msg.pin?.sheet_id === sheetId) {
        setPins((prev) => (prev.some((p) => p.id === msg.pin.id) ? prev : [...prev, msg.pin]));
      }
      if (msg.event === "pin_updated" && msg.pin?.sheet_id === sheetId) {
        setPins((prev) => prev.map((p) => (p.id === msg.pin.id ? msg.pin : p)));
      }
      if (msg.event === "pin_deleted" && msg.sheet_id === sheetId) {
        setPins((prev) => prev.filter((p) => p.id !== msg.pin_id));
        if (selectedPinIdRef.current === msg.pin_id) setSelectedPinId(null);
      }
      if (msg.event === "comment_created" && msg.comment?.pin_id === selectedPinIdRef.current) {
        setComments((prev) => (prev.some((c) => c.id === msg.comment.id) ? prev : [...prev, msg.comment]));
      }
    });
    return () => ws?.close();
  }, [user, projectId, sheetId]);

  const filteredPins = useMemo(() => {
    return pins.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (tradeFilter !== "all" && p.trade !== tradeFilter) return false;
      return true;
    });
  }, [pins, statusFilter, tradeFilter]);

  const selectedPin = pins.find((p) => p.id === selectedPinId) ?? null;

  useEffect(() => {
    setEditingDetails(false);
    if (!selectedPinId) {
      setComments([]);
      return;
    }
    setCommentsLoading(true);
    listComments(selectedPinId)
      .then(setComments)
      .finally(() => setCommentsLoading(false));
  }, [selectedPinId]);

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setSelectedPinId(null);
    setDraftPos({ x, y });
    setDraftTitle("");
    setDraftTrade("");
    setDraftPriority("normal");
    setDraftAssignee("");
    setDraftError(null);
  }

  function closePanel() {
    setDraftPos(null);
    setSelectedPinId(null);
  }

  async function handleCreatePin(e: React.FormEvent) {
    e.preventDefault();
    if (!draftPos || !draftTitle.trim()) return;
    setDraftBusy(true);
    setDraftError(null);
    try {
      const pin = await createPin(sheetId, {
        x: draftPos.x,
        y: draftPos.y,
        title: draftTitle.trim(),
        trade: draftTrade || null,
        priority: draftPriority,
        assigned_to_id: draftAssignee || null,
      });
      setPins((prev) => [...prev, pin]);
      setDraftPos(null);
      setSelectedPinId(pin.id);
    } catch (err) {
      setDraftError(err instanceof ApiError ? err.message : "Couldn't create the pin.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleStatusChange(status: PinStatus) {
    if (!selectedPin) return;
    const updated = await updatePin(sheetId, selectedPin.id, { status });
    setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleAssigneeChange(assignedToId: number | "") {
    if (!selectedPin) return;
    const updated = await updatePin(sheetId, selectedPin.id, { assigned_to_id: assignedToId || null });
    setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function startEditingDetails() {
    if (!selectedPin) return;
    setEditTitle(selectedPin.title);
    setEditTrade(selectedPin.trade ?? "");
    setEditingDetails(true);
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPin || !editTitle.trim()) return;
    setEditBusy(true);
    try {
      const updated = await updatePin(sheetId, selectedPin.id, {
        title: editTitle.trim(),
        trade: editTrade || null,
      });
      setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingDetails(false);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDeletePin() {
    if (!selectedPin) return;
    if (!window.confirm(`Delete pin #${selectedPin.id} — "${selectedPin.title}"? This can't be undone.`)) return;
    setDeleteBusy(true);
    try {
      await deletePin(sheetId, selectedPin.id);
      setPins((prev) => prev.filter((p) => p.id !== selectedPin.id));
      setSelectedPinId(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPin || !commentBody.trim()) return;
    setCommentBusy(true);
    try {
      const comment = await addComment(selectedPin.id, commentBody.trim());
      setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
      setCommentBody("");
    } finally {
      setCommentBusy(false);
    }
  }

  function handleAttachmentUploaded(attachment: any) {
    if (!selectedPin) return;
    setPins((prev) =>
      prev.map((p) => (p.id === selectedPin.id ? { ...p, attachments: [...p.attachments, attachment] } : p))
    );
  }

  if (loading || !user || fetching) return <PageLoader />;

  if (loadError || !sheet) {
    return (
      <div className="flex min-h-screen flex-col">
        <Topbar />
        <main className="flex flex-1 items-center justify-center">
          <p style={{ color: "var(--paper-dim)" }}>{loadError || "Sheet not found."}</p>
        </main>
      </div>
    );
  }

  const showPanel = Boolean(draftPos || selectedPin);

  const panelBody = draftPos ? (
    <form onSubmit={handleCreatePin} className="flex flex-col gap-3">
      <span className="label-mono">New pin</span>
      <input
        className="field"
        placeholder="What's the issue?"
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        autoFocus
        required
      />
      <div>
        <label className="label-mono mb-1 block">Trade</label>
        <select className="field" value={draftTrade} onChange={(e) => setDraftTrade(e.target.value as UserRole | "")}>
          <option value="">Unspecified</option>
          {TRADES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-mono mb-1 block">Priority</label>
        <select className="field" value={draftPriority} onChange={(e) => setDraftPriority(e.target.value)}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-mono mb-1 block">Assign to</label>
        <select
          className="field"
          value={draftAssignee}
          onChange={(e) => setDraftAssignee(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.user?.full_name}
            </option>
          ))}
        </select>
      </div>
      {draftError && (
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {draftError}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={draftBusy} className="btn-primary flex-1">
          {draftBusy ? "Dropping…" : "Drop pin"}
        </button>
        <button type="button" onClick={closePanel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  ) : selectedPin ? (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="label-mono">Pin #{selectedPin.id}</span>
          <span
            className="rounded-sm px-2 py-0.5 text-xs font-semibold"
            style={{ background: STATUS_COLOR[selectedPin.status], color: "#0b1521" }}
          >
            {STATUS_LABEL[selectedPin.status]}
          </span>
        </div>

        {editingDetails ? (
          <form onSubmit={handleSaveDetails} className="flex flex-col gap-2">
            <input className="field" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus required />
            <select className="field" value={editTrade} onChange={(e) => setEditTrade(e.target.value as UserRole | "")}>
              <option value="">Unspecified trade</option>
              {TRADES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="submit" disabled={editBusy} className="btn-primary flex-1 text-sm">
                {editBusy ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditingDetails(false)} className="btn-ghost text-sm">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-medium">{selectedPin.title}</h2>
              <button onClick={startEditingDetails} className="label-mono shrink-0" style={{ color: "var(--amber)" }}>
                Edit
              </button>
            </div>
            <p className="label-mono mt-1">
              {selectedPin.priority} priority{selectedPin.trade ? ` · ${selectedPin.trade.replace(/_/g, " ")}` : ""}
            </p>
            {selectedPin.total_cost > 0 && (
              <p className="text-sm mt-1" style={{ color: "var(--amber)" }}>
                {selectedPin.total_cost.toLocaleString(undefined, { style: "currency", currency: "USD" })} in
                materials
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <label className="label-mono mb-1 block">Status</label>
        <select className="field" value={selectedPin.status} onChange={(e) => handleStatusChange(e.target.value as PinStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label-mono mb-1 block">Assigned to</label>
        <select
          className="field"
          value={selectedPin.assigned_to_id ?? ""}
          onChange={(e) => handleAssigneeChange(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.user?.full_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label-mono">Photos</span>
        </div>
        {selectedPin.attachments.length > 0 && (
          <div className="mb-2 grid grid-cols-3 gap-2">
            {selectedPin.attachments.map((att) => (
              <a
                key={att.id}
                href={attachmentUrl(att)}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-sm border"
                style={{ borderColor: "var(--line)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachmentUrl(att)} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
        <AttachmentUploader pinId={selectedPin.id} onUploaded={handleAttachmentUploaded} />
      </div>

      <div>
        <span className="label-mono mb-2 block">Thread</span>
        <div className="flex flex-col gap-3">
          {commentsLoading ? (
            [0, 1].map((i) => (
              <div key={i} className="panel p-3" style={{ opacity: 0.5 }}>
                <div className="mb-2 h-3 w-1/3 animate-pulse rounded-sm" style={{ background: "var(--line)" }} />
                <div className="h-3 w-full animate-pulse rounded-sm" style={{ background: "var(--line-soft)" }} />
              </div>
            ))
          ) : comments.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
              No comments yet.
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="panel p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium">{c.author.full_name}</span>
                  <span className="label-mono">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-sm" style={{ color: "var(--paper)" }}>
                  {c.body}
                </p>
                {c.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.attachments.map((att) => (
                      <a key={att.id} href={attachmentUrl(att)} target="_blank" rel="noreferrer" className="block h-14 w-14 overflow-hidden rounded-sm border" style={{ borderColor: "var(--line)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={attachmentUrl(att)} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleAddComment} className="mt-3 flex flex-col gap-2">
          <textarea
            className="field"
            rows={3}
            placeholder="Add a comment…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
          />
          <button type="submit" disabled={commentBusy || !commentBody.trim()} className="btn-primary self-start">
            {commentBusy ? "Posting…" : "Post comment"}
          </button>
        </form>
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: "0.75rem" }}>
        <button onClick={handleDeletePin} disabled={deleteBusy} className="label-mono" style={{ color: "var(--red)" }}>
          {deleteBusy ? "Deleting…" : "Delete this pin"}
        </button>
      </div>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p style={{ color: "var(--paper-dim)" }}>Click anywhere on the sheet</p>
      <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
        to drop a pin, or select an existing one to see its thread.
      </p>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <div
        className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div>
          <Link href={`/projects/${projectId}`} className="label-mono" style={{ color: "var(--amber)" }}>
            ← Back to project
          </Link>
          <h1 className="mt-1" style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem" }}>
            {sheet.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <select className="field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PinStatus | "all")} style={{ width: "auto" }}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select className="field" value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value as UserRole | "all")} style={{ width: "auto" }}>
            <option value="all">All trades</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-1" style={{ minHeight: 0 }}>
        <div className="relative flex-1 overflow-auto p-4 sm:p-6" style={{ background: "var(--ink)" }}>
          <p className="label-mono mb-3 text-center md:hidden">Tap the plan to drop a pin</p>
          <div ref={imgRef} onClick={handleImageClick} className="crosshair-cursor relative mx-auto" style={{ maxWidth: 1100, border: "1px solid var(--line)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sheetImageUrl(sheet)} alt={sheet.title} className="block w-full select-none" draggable={false} />

            {filteredPins.map((p) => (
              <button
                key={p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftPos(null);
                  setSelectedPinId(p.id);
                }}
                className={`pin-marker absolute flex h-6 w-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 ${
                  p.priority === "urgent" ? "pulse" : ""
                }`}
                style={{
                  left: `${p.x * 100}%`,
                  top: `${p.y * 100}%`,
                  background: STATUS_COLOR[p.status],
                  borderColor: selectedPinId === p.id ? "var(--paper)" : "rgba(11,21,33,0.5)",
                }}
                title={`${p.title} · ${p.priority} priority`}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: "#0b1521" }}>{p.id}</span>
              </button>
            ))}

            {draftPos && (
              <div
                className="pin-marker absolute flex h-6 w-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2"
                style={{ left: `${draftPos.x * 100}%`, top: `${draftPos.y * 100}%`, background: "var(--amber)", borderColor: "var(--paper)" }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: "#241705" }}>+</span>
              </div>
            )}
          </div>
        </div>

        <aside className="hidden w-96 shrink-0 overflow-y-auto p-5 md:block" style={{ borderLeft: "1px solid var(--line)", background: "var(--ink-2)" }}>
          {panelBody}
        </aside>
      </div>

      {showPanel && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0" style={{ background: "rgba(11,21,33,0.6)" }} onClick={closePanel} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col overflow-y-auto rounded-t-lg p-5" style={{ background: "var(--ink-2)", borderTop: "1px solid var(--line)" }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="mx-auto h-1 w-10 rounded-full" style={{ background: "var(--line)" }} />
              <button onClick={closePanel} className="label-mono absolute right-5 top-5" style={{ color: "var(--paper-dim)" }} aria-label="Close">
                Close
              </button>
            </div>
            {panelBody}
          </div>
        </div>
      )}
    </div>
  );
}
