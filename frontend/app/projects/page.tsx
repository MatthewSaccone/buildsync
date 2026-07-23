"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import { listProjects, createProject, ApiError, type Project } from "@/lib/api";

export default function ProjectsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    listProjects()
      .then(setProjects)
      .finally(() => setFetching(false));
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const project = await createProject({ name, address: address || undefined });
      setProjects((prev) => [...prev, project]);
      setName("");
      setAddress("");
      setShowForm(false);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the project.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <PageLoader />;

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}>Projects</h1>
            <p className="label-mono mt-1">{projects.length} active</p>
          </div>
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            {showForm ? "Cancel" : "New project"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="panel mb-6 flex flex-col gap-3 p-5">
            <div>
              <label className="label-mono mb-1 block">Project name</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label-mono mb-1 block">Site address (optional)</label>
              <input className="field" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            {error && (
              <p className="text-sm" style={{ color: "var(--red)" }}>
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {busy ? "Creating…" : "Create project"}
            </button>
          </form>
        )}

        {fetching ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="panel flex flex-col gap-3 p-5" style={{ opacity: 0.5 }}>
                <div className="h-4 w-2/3 animate-pulse rounded-sm" style={{ background: "var(--line)" }} />
                <div className="h-3 w-1/2 animate-pulse rounded-sm" style={{ background: "var(--line-soft)" }} />
                <div className="h-3 w-1/3 animate-pulse rounded-sm" style={{ background: "var(--line-soft)" }} />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="panel flex flex-col items-center gap-2 px-6 py-16 text-center">
            <p style={{ color: "var(--paper-dim)" }}>No projects yet.</p>
            <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
              Create one to start uploading sheets and dropping pins.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="panel flex flex-col gap-2 p-5 transition-colors hover:border-[var(--amber-dim)]"
              >
                <span className="text-lg font-medium">{p.name}</span>
                <span className="text-sm" style={{ color: "var(--paper-dim)" }}>
                  {p.address || "No address on file"}
                </span>
                <span className="label-mono mt-2">
                  Created {new Date(p.created_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
