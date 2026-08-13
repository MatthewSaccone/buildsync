"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listSheets,
  listEstimates,
  getEstimate,
  startEstimate,
  confirmEstimate,
  overrideEstimateLine,
  type Project,
  type Sheet,
  type EstimateSessionOut,
} from "@/lib/api";

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

const CATEGORY_LABELS: Record<string, string> = {
  framing_studs: "Framing — studs",
  framing_plates: "Framing — plates",
  drywall: "Drywall",
  paint: "Paint",
  roofing: "Roofing",
  concrete: "Concrete",
};

export default function ProjectCostsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [estimates, setEstimates] = useState<EstimateSessionOut[]>([]);
  const [fetching, setFetching] = useState(true);

  // Which estimate (if any) is open in detail view. null = showing the list.
  const [openEstimate, setOpenEstimate] = useState<EstimateSessionOut | null>(null);

  const [selectedSheetId, setSelectedSheetId] = useState<number | "">("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    getProject(projectId).then(setProject);
    listSheets(projectId).then(setSheets);
    refreshEstimates();
  }, [user, projectId]);

  function refreshEstimates() {
    setFetching(true);
    listEstimates(projectId)
      .then(setEstimates)
      .finally(() => setFetching(false));
  }

  async function handleStart() {
    if (!selectedSheetId) return;
    setStarting(true);
    setError(null);
    try {
      const session = await startEstimate(projectId, Number(selectedSheetId));
      setEstimates((prev) => [session, ...prev]);
      setOpenEstimate(session);
    } catch (e: any) {
      setError(e?.detail?.detail || "Could not start estimate from this drawing.");
    } finally {
      setStarting(false);
    }
  }

  async function openDetail(id: number) {
    const session = await getEstimate(projectId, id);
    setOpenEstimate(session);
  }

  function backToList() {
    setOpenEstimate(null);
    refreshEstimates();
  }

  if (loading || !user || !project) return <PageLoader />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}>
            {openEstimate ? `Estimate #${openEstimate.id}` : "Costs"}
          </h1>
          <p className="label-mono mt-1">{project.name}</p>
        </div>
        {openEstimate && (
          <button onClick={backToList} className="btn-primary" style={{ background: "transparent" }}>
            ← Back to estimates
          </button>
        )}
      </div>

      {openEstimate ? (
        <EstimateDetail
          projectId={projectId}
          session={openEstimate}
          onUpdate={setOpenEstimate}
        />
      ) : (
        <>
          <div className="panel mb-6 p-4">
            <p className="label-mono mb-2">Start a new estimate from a drawing</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="field"
                value={selectedSheetId}
                onChange={(e) => setSelectedSheetId(e.target.value ? Number(e.target.value) : "")}
                style={{ width: "auto", minWidth: "220px" }}
              >
                <option value="">Select a sheet…</option>
                {sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <button onClick={handleStart} disabled={!selectedSheetId || starting} className="btn-primary">
                {starting ? "Reading drawing…" : "Generate estimate"}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs" style={{ color: "var(--danger, #c0392b)" }}>
                {error}
              </p>
            )}
            <p className="mt-2 text-xs" style={{ color: "var(--paper-dim)" }}>
              This produces a planning estimate, not a binding quote — you&apos;ll confirm the extracted dimensions
              before any cost is calculated.
            </p>
          </div>

          {fetching ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => (
                <div key={i} className="panel h-14 animate-pulse" style={{ opacity: 0.5 }} />
              ))}
            </div>
          ) : estimates.length === 0 ? (
            <div className="panel px-6 py-16 text-center" style={{ color: "var(--paper-dim)" }}>
              No estimates yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {estimates.map((est) => (
                <button
                  key={est.id}
                  onClick={() => openDetail(est.id)}
                  className="panel flex items-center justify-between px-4 py-3 text-left"
                  style={{ width: "100%" }}
                >
                  <div>
                    <p>Estimate #{est.id}</p>
                    <p className="label-mono">
                      {est.status === "pending_review"
                        ? "Awaiting dimension review"
                        : est.status === "failed"
                        ? "Extraction failed"
                        : "Finalized"}
                    </p>
                  </div>
                  {est.status === "finalized" && (
                    <p className="text-lg font-semibold" style={{ color: "var(--amber)" }}>
                      {formatPrice(est.total_cost)}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EstimateDetail({
  projectId,
  session,
  onUpdate,
}: {
  projectId: number;
  session: EstimateSessionOut;
  onUpdate: (s: EstimateSessionOut) => void;
}) {
  const ext = session.extracted_dimensions || {};
  const lowConfidence = new Set(session.low_confidence_fields || []);

  const [wallLength, setWallLength] = useState(ext.wall_length_ft?.toString() || "");
  const [wallHeight, setWallHeight] = useState("8");
  const [openingSqft, setOpeningSqft] = useState(ext.opening_sqft?.toString() || "0");
  const [floorArea, setFloorArea] = useState(ext.floor_area_sqft?.toString() || "");
  const [roofArea, setRoofArea] = useState(ext.roof_area_sqft?.toString() || "");
  const [scaleRatio, setScaleRatio] = useState(ext.scale_ratio?.toString() || "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!wallLength) {
      setError("Wall length is required to generate an estimate.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const updated = await confirmEstimate(projectId, session.id, {
        scale_ratio: scaleRatio ? Number(scaleRatio) : null,
        wall_length_ft: Number(wallLength),
        wall_height_ft: Number(wallHeight) || 8,
        opening_sqft: Number(openingSqft) || 0,
        floor_area_sqft: Number(floorArea) || 0,
        roof_area_sqft: Number(roofArea) || 0,
      });
      onUpdate(updated);
    } catch (e: any) {
      setError(e?.detail?.detail || "Could not generate the estimate.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleSwap(lineId: number, variantId: number) {
    const updated = await overrideEstimateLine(projectId, session.id, lineId, variantId);
    onUpdate(updated);
  }

  return (
    <>
      {session.status !== "finalized" && (
        <div className="panel mb-6 p-4">
          <p className="label-mono mb-3">
            Confirm dimensions before generating costs — these were read off the drawing automatically and may be
            wrong. Fields flagged in amber had low extraction confidence.
          </p>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <Field label="Scale ratio (e.g. 100 for 1:100)" value={scaleRatio} onChange={setScaleRatio} flagged={!session.scale_ratio} />
            <Field label="Total wall length (ft)" value={wallLength} onChange={setWallLength} flagged={lowConfidence.has("wall_length_ft")} required />
            <Field label="Wall height (ft)" value={wallHeight} onChange={setWallHeight} />
            <Field label="Door/window area to subtract (sqft)" value={openingSqft} onChange={setOpeningSqft} flagged={lowConfidence.has("opening_sqft")} />
            <Field label="Floor area (sqft)" value={floorArea} onChange={setFloorArea} flagged={lowConfidence.has("floor_area_sqft")} />
            <Field label="Roof area (sqft)" value={roofArea} onChange={setRoofArea} flagged={lowConfidence.has("roof_area_sqft")} />
          </div>

          {error && (
            <p className="mt-3 text-xs" style={{ color: "var(--danger, #c0392b)" }}>
              {error}
            </p>
          )}

          <button onClick={handleConfirm} disabled={confirming} className="btn-primary mt-4">
            {confirming ? "Generating…" : "Confirm & generate estimate"}
          </button>
        </div>
      )}

      {session.lines.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th className="label-mono px-4 py-3 text-left">Category</th>
                <th className="label-mono px-4 py-3 text-left">Material</th>
                <th className="label-mono px-4 py-3 text-right">Qty</th>
                <th className="label-mono px-4 py-3 text-right">Unit price</th>
                <th className="label-mono px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {session.lines.map((line) => (
                <tr key={line.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <td className="px-4 py-3">{CATEGORY_LABELS[line.category] || line.category}</td>
                  <td className="px-4 py-3">
                    {line.unmatched ? (
                      <span style={{ color: "var(--danger, #c0392b)" }}>
                        No matching material in catalog — add one with coverage data set
                      </span>
                    ) : (
                      <>
                        <p>{line.material_label}</p>
                        {line.alternates.length > 0 && (
                          <div className="mt-1 flex gap-2">
                            {line.alternates.map((alt) => (
                              <button
                                key={alt.variant_id}
                                className="label-mono"
                                style={{ textDecoration: "underline", cursor: "pointer" }}
                                onClick={() => handleSwap(line.id, alt.variant_id)}
                              >
                                Use {alt.variant_label} ({formatPrice(alt.line_total)})
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{line.unmatched ? "—" : line.purchase_quantity}</td>
                  <td className="px-4 py-3 text-right">
                    {line.unit_price_snapshot != null ? formatPrice(line.unit_price_snapshot) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {line.unmatched ? "—" : formatPrice(line.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="label-mono px-4 py-3 text-right">
                  Total (materials only — labor/tax not included)
                </td>
                <td className="px-4 py-3 text-right text-lg font-semibold" style={{ color: "var(--amber)" }}>
                  {formatPrice(session.total_cost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  flagged,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  flagged?: boolean;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-mono" style={{ color: flagged ? "var(--amber)" : undefined }}>
        {label}
        {flagged ? " (low confidence)" : ""}
      </span>
      <input
        className="field"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  );
}
