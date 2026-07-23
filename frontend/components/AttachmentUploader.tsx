"use client";

import { useState } from "react";
import { uploadAttachment } from "@/lib/api";

interface Props {
  pinId?: number;
  commentId?: number;
  onUploaded?: (attachment: any) => void;
}

export function AttachmentUploader({
  pinId,
  commentId,
  onUploaded,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const result = await uploadAttachment(
        file,
        pinId,
        commentId
      );

      onUploaded?.(result);
    } catch (err: any) {
      setError(err.message || "Failed to upload photo");
    } finally {
      setUploading(false);

      // allow uploading the same file again if needed
      e.target.value = "";
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label
        className="btn-ghost cursor-pointer self-start text-sm"
      >
        <span>
          {uploading
            ? "Uploading photo..."
            : "📷 Attach photo"}
        </span>

        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>

      {error && (
        <p
          className="text-sm"
          style={{ color: "var(--red)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
