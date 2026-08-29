"use client";

import { useEffect, useRef, useState } from "react";
import { PenLine, Link as LinkIcon } from "lucide-react";
import type { Attachment } from "@/lib/api";
import { PhotoAnnotator } from "./PhotoAnnotator";
import { AttachToPicker } from "./AttachToPicker";

interface AnnotationOverlayProps {
  attachment: Attachment;
}

/** Renders an attachment's saved annotation strokes on top of its thumbnail. */
function AnnotationOverlay({ attachment }: AnnotationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!attachment.annotations) return;
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const { width, height } = parent.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let strokes: { color: string; points: { x: number; y: number }[] }[] = [];
    try {
      strokes = JSON.parse(attachment.annotations);
    } catch {
      return;
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (const pt of stroke.points.slice(1)) ctx.lineTo(pt.x * width, pt.y * height);
      ctx.stroke();
    }
  }, [attachment.annotations]);

  if (!attachment.annotations) return null;
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

interface Props {
  projectId: number;
  attachments: Attachment[];
  onUpdated?: (attachment: Attachment) => void;
  onAttached?: (copy: Attachment) => void;
  /** Show the "Attach to task/pin" action -- hide it on photos that are
   * already viewed from within a task or pin. */
  allowAttach?: boolean;
}

/** A grid of photo attachments with actions to annotate them (BS-302-2) or
 * attach a copy to a task/pin (BS-302-3 / BS-302-4). */
export function PhotoGrid({ projectId, attachments, onUpdated, onAttached, allowAttach = true }: Props) {
  const [annotating, setAnnotating] = useState<Attachment | null>(null);
  const [attaching, setAttaching] = useState<Attachment | null>(null);

  const photos = attachments.filter((a) => a.is_image);
  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((a) => (
          <div
            key={a.id}
            className="group relative overflow-hidden rounded"
            style={{ border: "1px solid var(--line-soft)", aspectRatio: "1" }}
          >
            <a href={a.url} target="_blank" rel="noreferrer" className="block h-full w-full">
              <img src={a.url} alt="" className="h-full w-full object-cover" />
            </a>
            <AnnotationOverlay attachment={a} />
            <div
              className="absolute inset-x-0 bottom-0 flex justify-end gap-1 p-1 opacity-0 transition-opacity group-hover:opacity-100"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
            >
              <button
                onClick={() => setAnnotating(a)}
                aria-label="Annotate photo"
                title="Annotate"
                className="rounded p-1"
                style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
              >
                <PenLine size={14} />
              </button>
              {allowAttach && (
                <button
                  onClick={() => setAttaching(a)}
                  aria-label="Attach to task or pin"
                  title="Attach to task/pin"
                  className="rounded p-1"
                  style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
                >
                  <LinkIcon size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {annotating && (
        <PhotoAnnotator
          attachment={annotating}
          onClose={() => setAnnotating(null)}
          onSaved={(updated) => onUpdated?.(updated)}
        />
      )}

      {attaching && (
        <AttachToPicker
          projectId={projectId}
          attachment={attaching}
          onClose={() => setAttaching(null)}
          onAttached={(copy) => onAttached?.(copy)}
        />
      )}
    </>
  );
}
