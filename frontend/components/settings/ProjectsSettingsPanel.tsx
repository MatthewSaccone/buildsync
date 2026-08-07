"use client";

import { useEffect, useState } from "react";
import {
  listProjects,
  listMembers,
  updateProject,
  addMember,
  updateMemberRole,
  removeMember,
  lookupUser,
  ApiError,
  type Project,
  type ProjectMember,
  type ProjectRole,
} from "@/lib/api";

const ROLES: ProjectRole[] = ["owner", "admin", "member", "viewer"];

export default function ProjectsSettingsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    listProjects()
      .then((ps) => {
        setProjects(ps);
        if (ps.length > 0) setSelectedId(ps[0].id);
      })
      .finally(() => setLoadingProjects(false));
  }, []);

  function handleProjectUpdated(updated: Project) {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  if (loadingProjects) {
    return (
      <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
        Loading…
      </p>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
        You&rsquo;re not part of any projects yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {/* Project list */}
      <nav className="panel flex w-full shrink-0 flex-col gap-1 p-2 sm:w-56">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            className="rounded-sm px-3 py-2 text-left text-sm transition-colors"
            style={{
              background: selectedId === p.id ? "#fdf1ea" : "transparent",
              color: selectedId === p.id ? "var(--amber-bright)" : "var(--paper)",
            }}
          >
            {p.name}
          </button>
        ))}
      </nav>

      {/* Detail */}
      <div className="min-w-0 flex-1">
        {selectedId != null && (
          <ProjectDetail
            key={selectedId}
            project={projects.find((p) => p.id === selectedId)!}
            onProjectUpdated={handleProjectUpdated}
          />
        )}
      </div>
    </div>
  );
}

function ProjectDetail({
  project,
  onProjectUpdated,
}: {
  project: Project;
  onProjectUpdated: (updated: Project) => void;
}) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(true);

  const [name, setName] = useState(project.name);
  const [address, setAddress] = useState(project.address ?? "");
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSaved, setDetailSaved] = useState(false);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<number | null>(null);

  useEffect(() => {
    listMembers(project.id)
      .then(setMembers)
      .finally(() => setLoadingDetail(false));
  }, [project.id]);

  async function handleDetailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDetailError(null);
    setDetailSaved(false);
    setDetailSaving(true);
    try {
      const updated = await updateProject(project.id, {
        name: name.trim(),
        address: address.trim() || null,
      });
      onProjectUpdated(updated);
      setDetailSaved(true);
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : "Couldn't save project details.");
    } finally {
      setDetailSaving(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberError(null);
    setMemberBusy(true);
    try {
      const target = await lookupUser(memberEmail);
      const member = await addMember(project.id, { user_id: target.id });
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
      const updated = await updateMemberRole(project.id, memberId, role);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
    } catch {
      // no-op
    } finally {
      setRoleBusyId(null);
    }
  }

  async function handleRemoveMember(memberId: number) {
    if (!confirm("Remove this person from the project?")) return;
    setRoleBusyId(memberId);
    try {
      await removeMember(project.id, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      // no-op
    } finally {
      setRoleBusyId(null);
    }
  }

  if (loadingDetail) {
    return (
      <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
        Loading…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="label-mono mb-3">Project details</h2>
        <form onSubmit={handleDetailSubmit} className="panel flex max-w-md flex-col gap-3 p-4">
          <label className="flex flex-col gap-1">
            <span className="label-mono">Name</span>
            <input
              className="field"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDetailSaved(false);
              }}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-mono">Address</span>
            <input
              className="field"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setDetailSaved(false);
              }}
              placeholder="Optional"
            />
          </label>

          {detailError && (
            <p className="text-xs" style={{ color: "var(--red)" }}>
              {detailError}
            </p>
          )}
          {detailSaved && !detailError && (
            <p className="text-xs" style={{ color: "var(--green)" }}>
              Saved.
            </p>
          )}

          <button type="submit" disabled={detailSaving} className="btn-primary mt-1 w-fit text-sm">
            {detailSaving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="label-mono mb-3">Team</h2>
        <div className="panel flex w-fit max-w-full flex-col gap-3 p-4">
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
  );
}
