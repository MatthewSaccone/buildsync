"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import ProjectTabs from "@/components/ProjectTabs";
import DashboardPage from "./dashboard/page";
import ProjectPinsPage from "./pins/page";
import ProjectCostsPage from "./costs/page";
import ProjectSheetsPage from "./sheets/page";
import ProjectChatPage from "./chat/page";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
  lookupUser,
  searchProject,
  ApiError,
  type Project,
  type ProjectMember,
  type ProjectRole,
  type SearchHit,
} from "@/lib/api";

const ROLES: ProjectRole[] = ["owner", "admin", "member", "viewer"];

export default function ProjectDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [activeTab, setActiveTab] = useState<"dashboard" | "sheets" | "pins" | "costs" | "chat">("dashboard");

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [fetching, setFetching] = useState(true);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<number | null>(null);

  // Search
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    Promise.all([getProject(projectId), listMembers(projectId)])
      .then(([p, m]) => {
        setProject(p);
        setMembers(m);
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
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

        <ProjectTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "dashboard" && (<DashboardPage />)}

        {activeTab === "sheets" && (<ProjectSheetsPage />)}

        {activeTab === "pins" && (<ProjectPinsPage />)}

        {activeTab === "costs" && (<ProjectCostsPage />)}

        {activeTab === "chat" && (<ProjectChatPage />)}

        {/* Search */}
        {activeTab === "pins" && (
          <>
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
                      className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]"
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
          </>
        )}

        <div className="max-w-[320px]">
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
                      className="field text-sm"
                      style={{ width: "auto" }}
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
