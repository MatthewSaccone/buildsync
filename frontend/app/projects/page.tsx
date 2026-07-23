"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";

import { useAuth } from "@/lib/auth";
import {
  listProjects,
  createProject,
  ApiError,
  type Project,
} from "@/lib/api";

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
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);


  useEffect(() => {
    if (!user) return;

    listProjects()
      .then(setProjects)
      .finally(() => setFetching(false));

  }, [user]);


  async function handleCreate(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError(null);
    setBusy(true);

    try {
      const project = await createProject({
        name,
        address: address || undefined,
      });

      setProjects((prev) =>
        [...prev, project].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      setName("");
      setAddress("");
      setShowForm(false);

    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't create project."
      );
    } finally {
      setBusy(false);
    }
  }


  if (loading || !user) {
    return <PageLoader />;
  }


  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.8rem",
              }}
            >
              Projects
            </h1>

            <p
              className="label-mono mt-1"
              style={{
                color: "var(--paper-dim)",
              }}
            >
              Your active construction sets
            </p>
          </div>


          <button
            className="btn-primary"
            onClick={() =>
              setShowForm((v) => !v)
            }
          >
            {showForm
              ? "Cancel"
              : "New project"}
          </button>
        </div>


        {showForm && (
          <form
            onSubmit={handleCreate}
            className="panel mb-6 flex flex-col gap-3 p-5"
          >
            <input
              className="field"
              placeholder="Project name"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              required
            />

            <input
              className="field"
              placeholder="Address (optional)"
              value={address}
              onChange={(e) =>
                setAddress(e.target.value)
              }
            />

            {error && (
              <p
                className="text-sm"
                style={{
                  color: "var(--red)",
                }}
              >
                {error}
              </p>
            )}

            <button
              className="btn-primary self-start"
              disabled={busy}
            >
              {busy
                ? "Creating…"
                : "Create project"}
            </button>
          </form>
        )}


        {fetching ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="panel h-20 animate-pulse"
                style={{ opacity: 0.5 }}
              />
            ))}
          </div>

        ) : projects.length === 0 ? (

          <div
            className="panel px-6 py-12 text-center"
            style={{
              color: "var(--paper-dim)",
            }}
          >
            No projects yet.
          </div>

        ) : (

          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="panel p-5 transition-colors hover:border-[var(--amber)]"
              >
                <h2 className="font-medium">
                  {project.name}
                </h2>

                <p
                  className="label-mono mt-2"
                  style={{
                    color:
                      "var(--paper-dim)",
                  }}
                >
                  {project.address ||
                    "No address"}
                </p>
              </Link>
            ))}
          </div>

        )}

      </main>
    </div>
  );
}