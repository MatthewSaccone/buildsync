"use client";

import { useState } from "react";
import { uploadAttachment } from "@/lib/api";

interface Props {
  pinId?: number;
  commentId?: number;
  onUploaded?: (attachment: any) => void;
}

export function AttachmentUploader({ pinId, commentId, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadAttachment(file, pinId, commentId);
      if (onUploaded) onUploaded(result);
    } catch (err: any) {
      alert(err.message || "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-2">
      <label className="inline-flex items-center text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded cursor-pointer transition-colors">
        <span>{uploading ? "Uploading photo..." : "📷 Attach Photo"}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
    </div>
  );
}