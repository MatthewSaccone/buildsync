"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api";
import { AttachmentUploader } from "@/components/AttachmentUploader";

interface Attachment {
  id: number;
  file_path: string;
  filename: string;
}

interface Comment {
  id: number;
  text: string;
  user_id: number;
  user_email?: string;
  created_at: string;
  attachments?: Attachment[];
}

interface Pin {
  id: number;
  title: string;
  description: string;
  status: string;
  x: number;
  y: number;
  attachments?: Attachment[];
  comments?: Comment[];
}

interface Sheet {
  id: number;
  title: string;
  file_path: string;
  project_id: number;
  pins: Pin[];
}

export default function SheetViewerPage({
  params,
}: {
  params: Promise<{ id: string; sheetId: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const sheetId = resolvedParams.sheetId;

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [activePin, setActivePin] = useState<Pin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Comment state
  const [newCommentText, setNewCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // New Pin state
  const [newPinCoords, setNewPinCoords] = useState<{ x: number; y: number } | null>(null);
  const [newPinTitle, setNewPinTitle] = useState("");
  const [newPinDesc, setNewPinDesc] = useState("");

  const loadSheetData = async () => {
    try {
      const res = await fetchWithAuth(`/sheets/${sheetId}`);
      if (!res.ok) throw new Error("Failed to load sheet details");
      const data: Sheet = await res.json();
      setSheet(data);
      setPins(data.pins || []);

      if (activePin) {
        const updatedActive = data.pins.find((p) => p.id === activePin.id);
        if (updatedActive) setActivePin(updatedActive);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSheetData();
  }, [sheetId]);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setNewPinCoords({ x, y });
    setActivePin(null);
  };

  const handleCreatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPinCoords) return;

    try {
      const res = await fetchWithAuth(`/sheets/${sheetId}/pins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newPinTitle,
          description: newPinDesc,
          x: newPinCoords.x,
          y: newPinCoords.y,
          status: "open",
        }),
      });

      if (!res.ok) throw new Error("Failed to create pin");
      const createdPin: Pin = await res.json();

      setPins((prev) => [...prev, createdPin]);
      setActivePin(createdPin);
      setNewPinCoords(null);
      setNewPinTitle("");
      setNewPinDesc("");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePin || !newCommentText.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await fetchWithAuth(`/pins/${activePin.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newCommentText }),
      });

      if (!res.ok) throw new Error("Failed to add comment");

      setNewCommentText("");
      await loadSheetData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Loading sheet viewer...</div>;
  if (error || !sheet) return <div className="p-8 text-red-500">Error: {error || "Sheet not found"}</div>;

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Top Bar Navigation */}
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-4">
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-slate-500 hover:text-slate-900 font-medium"
          >
            ← Back to Project
          </Link>
          <span className="text-slate-300">|</span>
          <h1 className="font-bold text-slate-800">{sheet.title}</h1>
        </div>
      </header>

      {/* Main Canvas + Sidebar Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Drawing Canvas Area */}
        <div className="flex-1 relative overflow-auto p-8 flex items-center justify-center">
          <div className="relative inline-block border shadow-lg rounded bg-white">
            <img
              src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/${sheet.file_path}`}
              alt={sheet.title}
              className="max-w-full max-h-[80vh] object-contain cursor-crosshair select-none"
              onClick={handleImageClick}
            />

            {/* Pins Render Overlay */}
            {pins.map((pin) => (
              <button
                key={pin.id}
                onClick={() => {
                  setActivePin(pin);
                  setNewPinCoords(null);
                }}
                style={{ top: `${pin.y}%`, left: `${pin.x}%` }}
                className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-transform hover:scale-125 ${
                  activePin?.id === pin.id
                    ? "bg-blue-600 border-white text-white z-20 shadow-md ring-2 ring-blue-400"
                    : "bg-red-500 border-white text-white z-10"
                }`}
              >
                📍
              </button>
            ))}

            {/* Pending Pin Indicator */}
            {newPinCoords && (
              <div
                style={{ top: `${newPinCoords.y}%`, left: `${newPinCoords.x}%` }}
                className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-yellow-400 border-2 border-white animate-bounce z-30"
              />
            )}
          </div>
        </div>

        {/* Sidebar Panel */}
        <aside className="w-96 bg-white border-l flex flex-col h-full shadow-md">
          {/* Create New Pin Form Panel */}
          {newPinCoords && (
            <div className="p-6 border-b bg-slate-50">
              <h2 className="text-base font-semibold text-slate-800 mb-3">Drop New Pin</h2>
              <form onSubmit={handleCreatePin} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={newPinTitle}
                    onChange={(e) => setNewPinTitle(e.target.value)}
                    placeholder="e.g. Wire exposure issue"
                    className="w-full border rounded-lg p-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={newPinDesc}
                    onChange={(e) => setNewPinDesc(e.target.value)}
                    placeholder="Describe the issue or update..."
                    className="w-full border rounded-lg p-2 text-sm bg-white"
                  />
                </div>
                <div className="flex space-x-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 bg-slate-900 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-slate-800"
                  >
                    Save Pin
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPinCoords(null)}
                    className="px-3 border rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Active Pin Details Panel */}
          {activePin ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header Info */}
              <div className="p-6 border-b">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {activePin.status}
                  </span>
                  <button
                    onClick={() => setActivePin(null)}
                    className="text-slate-400 hover:text-slate-600 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <h2 className="text-lg font-bold text-slate-900">{activePin.title}</h2>
                <p className="text-sm text-slate-600 mt-1">{activePin.description}</p>

                {/* Pin Attachments Showcase */}
                {activePin.attachments && activePin.attachments.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Pin Photos
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {activePin.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/${att.file_path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded overflow-hidden border border-slate-200 aspect-square hover:opacity-80"
                        >
                          <img
                            src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/${att.file_path}`}
                            alt={att.filename}
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pin Photo Attachment Component */}
                <div className="mt-3">
                  <AttachmentUploader pinId={activePin.id} onUploaded={() => loadSheetData()} />
                </div>
              </div>

              {/* Comments Thread Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Activity & Comments
                </h3>

                {activePin.comments && activePin.comments.length > 0 ? (
                  activePin.comments.map((comment) => (
                    <div key={comment.id} className="bg-slate-50 p-3 rounded-lg border text-sm space-y-2">
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">
                          {comment.user_email || `User #${comment.user_id}`}
                        </span>
                        <span>{new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-slate-800 whitespace-pre-wrap">{comment.text}</p>

                      {/* Comment Attachments */}
                      {comment.attachments && comment.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {comment.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/${att.file_path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="w-16 h-16 rounded overflow-hidden border border-slate-200 block"
                            >
                              <img
                                src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/${att.file_path}`}
                                alt={att.filename}
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic">No comments yet. Mention team members with @email.</p>
                )}
              </div>

              {/* Comment Input Footer */}
              <div className="p-4 border-t bg-white">
                <form onSubmit={handleAddComment} className="space-y-2">
                  <textarea
                    rows={2}
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Write a comment or @mention someone..."
                    className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Use @email to notify</span>
                    <button
                      type="submit"
                      disabled={submittingComment || !newCommentText.trim()}
                      className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
                    >
                      {submittingComment ? "Posting..." : "Comment"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            !newPinCoords && (
              <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-400 text-sm">
                Click anywhere on the sheet to place a pin, or click an existing pin to view activity.
              </div>
            )
          )}
        </aside>
      </div>
    </div>
  );
}