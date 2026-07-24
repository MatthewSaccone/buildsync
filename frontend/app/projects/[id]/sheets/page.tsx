"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listSheets,
  sheetImageUrl,
  type Project,
  type Sheet,
} from "@/lib/api";

export default function ProjectSheetsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;

    Promise.all([
      getProject(projectId),
      listSheets(projectId),
    ])
      .then(([p, s]) => {
        setProject(p);
        setSheets(s);
      })
      .finally(() => setFetching(false));

  }, [user, projectId]);

  if (loading || !user || fetching || !project) {
    return <PageLoader />;
  }

  return (
    <div>
      <h2
        className="label-mono mb-3"
      >
        Sheets
      </h2>

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
                <p className="font-medium">
                  {sheet.title}
                </p>

                <p className="label-mono">
                  Current: v{sheet.version}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
