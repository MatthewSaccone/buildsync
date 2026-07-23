"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import ProjectTabs from "@/components/ProjectTabs";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
  lookupUser,
  listSheets,
  uploadSheet,
  uploadSheetVersion,
  listSheetVersions,
  sheetImageUrl,
  searchProject,
  ApiError,
  type Project,
  type ProjectMember,
  type ProjectRole,
  type Sheet,
  type SearchHit,
} from "@/lib/api";

const ROLES: ProjectRole[] = ["owner", "admin", "member", "viewer"];

export default function ProjectDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fetching, setFetching] = useState(true);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<number | null>(null);

  const [sheetTitle, setSheetTitle] = useState("");
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  // Version history: which sheet id has its history panel open, and the versions loaded for it
  const [historyOpenFor, setHistoryOpenFor] = useState<number | null>(null);
  const [versionsBySheet, setVersionsBySheet] = useState<Record<number, Sheet[]>>({});
  const [versionsLoading, setVersionsLoading] = useState(false);

  // New-version upload, per sheet
  const [versionFileBySheet, setVersionFileBySheet] = useState<Record<number, File | null>>({});
  const [versionBusyId, setVersionBusyId] = useState<number | null>(null);
  const [versionErrorBySheet, setVersionErrorBySheet] = useState<Record<number, string | null>>({});

  // Search
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    Promise.all([getProject(projectId), listMembers(projectId), listSheets(projectId)])
      .then(([p, m, s]) => {
        setProject(p);
        setMembers(m);
        setSheets(s);
      })
      .finally(() => setFetching(false));
  }, [user, projectId]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberError(null);
    setMemberBusy(true);
    try {
      const target = await lookupUser(memberEmail);
      const member = await addMember(projectId, { user_id: target.id });
      setMembers((prev) => [...prev, member]);
      setMemberEmail("");
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : "Couldn't add that person.");
    } finally {
      setMemberBusy(false);
    }
  }

  async function handleRoleChange(memberId: number, role: ProjectRole) {
    setRoleBusyId(memberId);
    try {
      const updated = await updateMemberRole(projectId, memberId, role);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
    } catch {
      // no-op; the select will just revert on next render since state wasn't updated
    } finally {
      setRoleBusyId(null);
    }
  }

  async function handleRemoveMember(memberId: number) {
    if (!confirm("Remove this person from the project?")) return;
    setRoleBusyId(memberId);
    try {
      await removeMember(projectId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      // no-op
    } finally {
      setRoleBusyId(null);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetFile) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      const sheet = await uploadSheet(projectId, sheetTitle, sheetFile);
      setSheets((prev) => [...prev, sheet]);
      setSheetTitle("");
      setSheetFile(null);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function toggleHistory(sheet: Sheet) {
    if (historyOpenFor === sheet.id) {
      setHistoryOpenFor(null);
      return;
    }
    setHistoryOpenFor(sheet.id);
    if (!versionsBySheet[sheet.id]) {
      setVersionsLoading(true);
      try {
        const versions = await listSheetVersions(projectId, sheet.id);
        setVersionsBySheet((prev) => ({ ...prev, [sheet.id]: versions }));
      } finally {
        setVersionsLoading(false);
      }
    }
  }

  async function handleVersionUpload(sheet: Sheet, e: React.FormEvent) {
    e.preventDefault();
    const file = versionFileBySheet[sheet.id];
    if (!file) return;
    setVersionBusyId(sheet.id);
    setVersionErrorBySheet((prev) => ({ ...prev, [sheet.id]: null }));
    try {
      const newVersion = await uploadSheetVersion(projectId, sheet.id, file);
      // Update the sheets grid to show the new latest version in place of the old one
      setSheets((prev) => prev.map((s) => (s.id === sheet.id ? newVersion : s)));
      // Prepend to the cached history list (keyed by the original sheet id) if it's loaded
      setVersionsBySheet((prev) => {
        const existing = prev[sheet.id];
        if (!existing) return prev;
        return { ...prev, [sheet.id]: [newVersion, ...existing] };
      });
      setVersionFileBySheet((prev) => ({ ...prev, [sheet.id]: null }));
    } catch (err) {
      setVersionErrorBySheet((prev) => ({
        ...prev,
        [sheet.id]: err instanceof ApiError ? err.message : "Upload failed.",
      }));
    } finally {
      setVersionBusyId(null);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await searchProject(projectId, query.trim());
      setSearchResults(res.results);
    } finally {
      setSearching(false);
    }
  }

  if (loading || !user || fetching || !project) return <PageLoader />;

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <Link href="/projects" className="label-mono mb-4 inline-block" style={{ color: "var(--amber)" }}>
          ← All projects
        </Link>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.7rem" }}>{project.name}</h1>
            <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
              {project.address || "No address on file"}
            </p>
          </div>
        </div>

        <ProjectTabs projectId={projectId} />

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6 flex items-center gap-2">
          <input
            className="field flex-1"
            placeholder="Search pins by title or comment…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" disabled={searching} className="btn-ghost text-sm">
            {searching ? "Searching…" : "Search"}
          </button>
          {searchResults !== null && (
            <button
              type="button"
              className="label-mono"
              style={{ color: "var(--paper-dim)" }}
              onClick={() => {
                setSearchResults(null);
                setQuery("");
              }}
            >
              Clear
            </button>
          )}
        </form>

        {searchResults !== null && (
          <div className="panel mb-8 flex flex-col divide-y" style={{ borderColor: "var(--line)" }}>
            {searchResults.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--paper-dim)" }}>
                No pins match “{query}”.
              </p>
            ) : (
              searchResults.map((hit) => (
                <Link
                  key={`${hit.pin.id}-${hit.matched_on}`}
                  href={`/projects/${projectId}/sheets/${hit.sheet_id}?pin=${hit.pin.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-[var(--ink-3)]"
                  style={{ borderColor: "var(--line-soft)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{hit.pin.title}</span>
                    <span className="label-mono">{hit.matched_on === "title" ? "Title match" : "Comment match"}</span>
                  </div>
                  {hit.snippet && (
                    <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                      {hit.snippet}
                    </p>
                  )}
                </Link>
              ))
            )}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          {/* Sheets */}
          <section>
            <h2 className="label-mono mb-3">Sheets</h2>
            {sheets.length === 0 ? (
              <div className="panel px-5 py-8 text-center text-sm" style={{ color: "var(--paper-dim)" }}>
                No sheets uploaded yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sheets.map((s) => (
                  <div key={s.id} className="panel overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <Link
                        href={`/projects/${projectId}/sheets/${s.id}`}
                        className="flex h-20 w-28 flex-shrink-0 items-center justify-center overflow-hidden"
                        style={{ background: "var(--ink)", border: "1px solid var(--line)" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={sheetImageUrl(s)}
                          alt={s.title}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </Link>
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          <Link href={`/projects/${projectId}/sheets/${s.id}`} className="font-medium hover:text-[var(--amber)]">
                            {s.title}
                          </Link>
                          <p className="label-mono">Current: v{s.version}</p>
                        </div>
                        <button
                          onClick={() => toggleHistory(s)}
                          className="label-mono self-start"
                          style={{ color: "var(--amber)" }}
                        >
                          {historyOpenFor === s.id ? "Hide history" : "Version history"}
                        </button>
                      </div>
                    </div>

                    {historyOpenFor === s.id && (
                      <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
                        <div className="pt-3">
                          {versionsLoading && !versionsBySheet[s.id] ? (
                            <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                              Loading versions…
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-1.5">
                              {(versionsBySheet[s.id] ?? []).map((v) => (
                                <li key={v.id} className="flex items-center justify-between text-sm">
                                  <a
                                    href={sheetImageUrl(v)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-[var(--amber)]"
                                  >
                                    v{v.version} — {v.title}
                                  </a>
                                  <span className="label-mono">
                                    {new Date(v.uploaded_at).toLocaleDateString()}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          <form
                            onSubmit={(e) => handleVersionUpload(s, e)}
                            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
                            style={{ borderTop: "1px solid var(--line-soft)", paddingTop: "0.75rem" }}
                          >
                            <input
                              type="file"
                              accept=".png,.jpg,.jpeg,.webp,.pdf"
                              onChange={(e) =>
                                setVersionFileBySheet((prev) => ({ ...prev, [s.id]: e.target.files?.[0] ?? null }))
                              }
                              className="flex-1 text-sm"
                            />
                            <button
                              type="submit"
                              disabled={versionBusyId === s.id || !versionFileBySheet[s.id]}
                              className="btn-ghost text-sm"
                            >
                              {versionBusyId === s.id ? "Uploading…" : "Upload new version"}
                            </button>
                          </form>
                          {versionErrorBySheet[s.id] && (
                            <p className="mt-1 text-sm" style={{ color: "var(--red)" }}>
                              {versionErrorBySheet[s.id]}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleUpload} className="panel mt-4 flex flex-col gap-3 p-4">
              <span className="label-mono">Upload a new sheet</span>
              <input
                className="field"
                placeholder="Title, e.g. Level 1 — Electrical"
                value={sheetTitle}
                onChange={(e) => setSheetTitle(e.target.value)}
                required
              />
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf"
                onChange={(e) => setSheetFile(e.target.files?.[0] ?? null)}
                className="text-sm"
                required
              />
              {uploadError && (
                <p className="text-sm" style={{ color: "var(--red)" }}>
                  {uploadError}
                </p>
              )}
              <button type="submit" disabled={uploadBusy} className="btn-primary self-start">
                {uploadBusy ? "Uploading…" : "Upload"}
              </button>
            </form>
          </section>

          {/* Members */}
          <section>
            <h2 className="label-mono mb-3">Team</h2>
            <div className="panel flex flex-col gap-3 p-4">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p>{m.user.full_name}</p>
                    <p className="label-mono">{m.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="field"
                      style={{ width: "auto", padding: "0.3rem 0.5rem" }}
                      value={m.role}
                      disabled={roleBusyId === m.id}
                      onChange={(e) => handleRoleChange(m.id, e.target.value as ProjectRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      disabled={roleBusyId === m.id}
                      className="label-mono"
                      style={{ color: "var(--red)" }}
                      aria-label={`Remove ${m.user.full_name}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <form
                onSubmit={handleAddMember}
                className="mt-2 flex flex-col gap-2"
                style={{ borderTop: "1px solid var(--line-soft)", paddingTop: "0.75rem" }}
              >
                <input
                  className="field"
                  type="email"
                  placeholder="teammate@email.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  required
                />
                {memberError && (
                  <p className="text-xs" style={{ color: "var(--red)" }}>
                    {memberError}
                  </p>
                )}
                <button type="submit" disabled={memberBusy} className="btn-ghost text-sm">
                  {memberBusy ? "Adding…" : "Add to project"}
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
