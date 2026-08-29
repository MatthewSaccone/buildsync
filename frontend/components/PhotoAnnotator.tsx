"use client";

import { useEffect, useRef, useState } from "react";
import { X, Undo2 } from "lucide-react";
import { saveAttachmentAnnotations, ApiError, type Attachment } from "@/lib/api";

type Point = { x: number; y: number };
type Stroke = { color: string; points: Point[] };

const COLORS = ["#b23a2e", "#d9541f", "#2b5c7a", "#3f7a3f", "#ffffff"];

function parseStrokes(raw: string | null): Stroke[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface Props {
  attachment: Attachment;
  onClose: () => void;
  onSaved: (attachment: Attachment) => void;
}

/** Draws a freehand annotation overlay on top of a photo (BS-302-2). The
 * strokes are stored as normalized (0-1) points so they redraw correctly
 * at any display size, and are saved separately from the original image --
 * the source photo on disk is never touched. */
export function PhotoAnnotator({ attachment, onClose, onSaved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);

  const [strokes, setStrokes] = useState<Stroke[]>(() => parseStrokes(attachment.annotations));
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function redraw() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const { width, height } = container.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (const pt of stroke.points.slice(1)) {
        ctx.lineTo(pt.x * width, pt.y * height);
      }
      ctx.stroke();
    }
  }

  useEffect(() => {
    redraw();
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    setStrokes((prev) => [...prev, { color, points: [pointFromEvent(e)] }]);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const pt = pointFromEvent(e);
    setStrokes((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, points: [...last.points, pt] };
      return next;
    });
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  function handleUndo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await saveAttachmentAnnotations(attachment.id, JSON.stringify(strokes));
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save annotations.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded"
        style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--paper)" }}>Annotate photo</p>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--paper-dim)" }}>
            <X size={18} />
          </button>
        </div>

        <div ref={containerRef} className="relative" style={{ background: "#000" }}>
          <img
            ref={imgRef}
            src={attachment.url}
            alt=""
            className="block w-full select-none"
            style={{ maxHeight: "60vh", objectFit: "contain" }}
            onLoad={redraw}
            draggable={false}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="flex items-center gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Use color ${c}`}
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full"
                style={{
                  background: c,
                  border: color === c ? "2px solid var(--amber)" : "1px solid var(--line-soft)",
                }}
              />
            ))}
            <button onClick={handleUndo} disabled={strokes.length === 0} className="btn-ghost text-xs" aria-label="Undo last stroke">
              <Undo2 size={14} />
            </button>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save annotations"}
          </button>
        </div>

        {error && (
          <p className="px-4 pb-3 text-sm" style={{ color: "var(--red)" }}>
            {error}
          </p>
        )}
      </div>
    </>
  );
}
