"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listSheets,
  uploadSheet,
  sheetImageUrl,
  ApiError,
  type Project,
  type Sheet,
} from "@/lib/api";

const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.webp,.pdf";

export default function ProjectSheetsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload form state
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    refreshSheets();
  }, [user, projectId]);

  function refreshSheets() {
    setError(null);
    setFetching(true);
    Promise.all([getProject(projectId), listSheets(projectId)])
      .then(([p, s]) => {
        setProject(p);
        setSheets(s);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load sheets.");
      })
      .finally(() => setFetching(false));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    // Pre-fill title from filename if the user hasn't typed one yet
    if (selected && !title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ""));
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) {
      setUploadError("A title and a file are both required.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const sheet = await uploadSheet(projectId, title.trim(), file);
      setSheets((prev) => [sheet, ...prev]);
      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof ApiError ? String(err.detail?.detail || err.message) : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (loading || !user || fetching) {
    return <PageLoader />;
  }

  if (error || !project) {
    return (
      <div
        className="panel px-5 py-8 text-center text-sm"
        style={{ color: "var(--paper-dim)" }}
      >
        {error || "Couldn't load this project."}
      </div>
    );
  }

  return (
    <div>
      <h2 className="label-mono mb-3">Sheets</h2>

      <form onSubmit={handleUpload} className="panel mb-6 flex flex-wrap items-end gap-2 p-4">
        <label className="flex flex-col gap-1" style={{ flex: "1 1 200px" }}>
          <span className="label-mono">Title</span>
          <input
            className="field"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Main floor plan"
          />
        </label>

        <label className="flex flex-col gap-1" style={{ flex: "1 1 220px" }}>
          <span className="label-mono">File (image or PDF)</span>
          <input
            ref={fileInputRef}
            className="field"
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
          />
        </label>

        <button type="submit" disabled={uploading || !file || !title.trim()} className="btn-primary">
          {uploading ? "Uploading…" : "Upload sheet"}
        </button>

        {uploadError && (
          <p className="w-full text-xs" style={{ color: "var(--danger, #c0392b)" }}>
            {uploadError}
          </p>
        )}
      </form>

      {sheets.length === 0 ? (
        <div
          className="panel px-5 py-8 text-center text-sm"
          style={{ color: "var(--paper-dim)" }}
        >
          No sheets uploaded yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sheets.map((sheet) => (
            <Link
              key={sheet.id}
              href={`/projects/${projectId}/sheets/${sheet.id}`}
              className="panel flex gap-3 p-3 hover:opacity-80"
            >
              <div
                className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--line)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sheetImageUrl(sheet)}
                  alt={sheet.title}
                  className="h-full w-full object-cover"
                />
              </div>

              <div>
                <p className="font-medium">{sheet.title}</p>
                <p className="label-mono">Current: v{sheet.version}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
