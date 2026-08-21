"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import {
  listMaterials,
  createMaterial,
  deleteMaterial,
  addMaterialVariant,
  updateMaterialVariant,
  deleteMaterialVariant,
  getCoverageDefaults,
  ApiError,
  MATERIAL_CATALOG_CATEGORIES,
  COVERAGE_UNITS,
  type Material,
  type CoverageUnit,
  type CoverageDefault,
} from "@/lib/api";

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

export default function MaterialsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [coverageValue, setCoverageValue] = useState("");
  const [coverageUnit, setCoverageUnit] = useState<CoverageUnit | "">("");
  // True until the user manually edits coverage — lets us auto-fill from the
  // category default without ever clobbering something they actually typed.
  const [coverageTouched, setCoverageTouched] = useState(false);
  const [coverageDefaults, setCoverageDefaults] = useState<CoverageDefault[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    refresh();
    getCoverageDefaults()
      .then(setCoverageDefaults)
      .catch(() => {
        // Non-critical — the form just falls back to fully manual entry.
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-fill coverage when the category changes to one with exactly one
  // unambiguous default (framing has two possible units — each/linear_ft —
  // so it's left for the user to pick rather than guessing which one).
  // Never overwrites a value the user already typed themselves.
  useEffect(() => {
    if (coverageTouched || !category) return;
    const matches = coverageDefaults.filter((d) => d.catalog_category === category);
    if (matches.length === 1) {
      setCoverageValue(String(matches[0].coverage_value));
      setCoverageUnit(matches[0].coverage_unit);
    }
  }, [category, coverageDefaults, coverageTouched]);

  function refresh(q?: string) {
    setFetching(true);

    listMaterials(q ? { q } : undefined)
      .then(setMaterials)
      .finally(() => setFetching(false));
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    refresh(search || undefined);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    setError(null);
    setBusy(true);

    try {
      const priceNum = parseFloat(price);
      const coverageNum = parseFloat(coverageValue);

      const material = await createMaterial({
        name,
        category: category || undefined,
        variants: size
          ? [
              {
                size,
                unit: unit || undefined,
                price: isNaN(priceNum) ? 0 : priceNum,
                coverage_value:
                  coverageUnit && !isNaN(coverageNum) ? coverageNum : undefined,
                coverage_unit: coverageUnit || undefined,
              },
            ]
          : [],
      });

      setMaterials((prev) =>
        [...prev, material].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      setName("");
      setCategory("");
      setSize("");
      setUnit("");
      setPrice("");
      setCoverageValue("");
      setCoverageUnit("");

      setShowForm(false);
      setExpandedId(material.id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't create that material."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMaterial(id: number) {
    if (
      !confirm(
        "Delete this material and all of its sizes/prices?"
      )
    ) {
      return;
    }

    await deleteMaterial(id);

    setMaterials((prev) =>
      prev.filter((material) => material.id !== id)
    );
  }

  if (loading || !user) {
    return <PageLoader />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.6rem",
              }}
            >
              Materials
            </h1>

            <p className="label-mono mt-1">
              Your private catalog — only you can see or edit these
            </p>
          </div>

          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            {showForm ? "Cancel" : "New material"}
          </button>
        </div>

        <form
          onSubmit={handleSearch}
          className="mb-4 flex gap-2"
        >
          <input
            className="field"
            placeholder="Search materials…"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />

          <button
            type="submit"
            className="btn-ghost"
          >
            Search
          </button>
        </form>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="panel mb-6 flex flex-col gap-4 p-5"
          >
            <div>
              <label className="label-mono mb-1 block">
                Material name
              </label>

              <input
                className="field"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                required
              />
            </div>

            <div>
              <label className="label-mono mb-1 block">
                Category (optional)
              </label>

              <input
                className="field"
                list="material-catalog-categories"
                placeholder="e.g. framing, drywall, paint"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value)
                }
              />
              <datalist id="material-catalog-categories">
                {MATERIAL_CATALOG_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="label-mono mt-1" style={{ opacity: 0.7 }}>
                Use one of: {MATERIAL_CATALOG_CATEGORIES.join(", ")} — only these are picked up by auto-estimates
              </p>
            </div>

            <p className="label-mono">
              First size / price (optional — you can add more after)
            </p>

            <div className="grid grid-cols-3 gap-2">
              <input
                className="field"
                placeholder="Size, e.g. 250ft roll"
                value={size}
                onChange={(e) =>
                  setSize(e.target.value)
                }
              />

              <input
                className="field"
                placeholder="Unit, e.g. roll"
                value={unit}
                onChange={(e) =>
                  setUnit(e.target.value)
                }
              />

              <input
                className="field"
                placeholder="Price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value)
                }
              />
            </div>

            <div>
              <label className="label-mono mb-1 block">
                Coverage (optional, but required for auto-estimates)
              </label>
              <p className="label-mono mb-2" style={{ opacity: 0.7 }}>
                How much real-world area/length one unit of this size covers — e.g. a 4x8 drywall sheet covers 32 sqft.
                {category && coverageDefaults.some((d) => d.catalog_category === category) && !coverageTouched && (
                  <> Pre-filled from a typical default for &ldquo;{category}&rdquo; — adjust if your product differs.</>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="field"
                  placeholder="Coverage amount, e.g. 32"
                  type="number"
                  step="any"
                  min="0"
                  value={coverageValue}
                  onChange={(e) => {
                    setCoverageTouched(true);
                    setCoverageValue(e.target.value);
                  }}
                />

                <select
                  className="field"
                  value={coverageUnit}
                  onChange={(e) => {
                    setCoverageTouched(true);
                    setCoverageUnit(e.target.value as CoverageUnit | "");
                  }}
                >
                  <option value="">No coverage unit</option>
                  {COVERAGE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p
                className="text-sm"
                style={{ color: "var(--red)" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-primary self-start"
            >
              {busy
                ? "Creating…"
                : "Create material"}
            </button>
          </form>
        )}
                {fetching ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="panel h-14 animate-pulse p-4"
                style={{ opacity: 0.5 }}
              />
            ))}
          </div>
        ) : materials.length === 0 ? (
          <div
            className="panel px-6 py-16 text-center"
            style={{ color: "var(--paper-dim)" }}
          >
            No materials in the catalog yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {materials.map((material) => (
              <MaterialRow
                key={material.id}
                material={material}
                expanded={expandedId === material.id}
                onToggle={() =>
                  setExpandedId(
                    expandedId === material.id
                      ? null
                      : material.id
                  )
                }
                onDelete={() =>
                  handleDeleteMaterial(material.id)
                }
                onChange={(updated) =>
                  setMaterials((prev) =>
                    prev.map((item) =>
                      item.id === updated.id
                        ? updated
                        : item
                    )
                  )
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function MaterialRow({
  material,
  expanded,
  onToggle,
  onDelete,
  onChange,
}: {
  material: Material;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onChange: (material: Material) => void;
}) {
  const [addingVariant, setAddingVariant] =
    useState(false);

  const [vSize, setVSize] = useState("");
  const [vUnit, setVUnit] = useState("");
  const [vPrice, setVPrice] = useState("");
  const [vCoverageValue, setVCoverageValue] = useState("");
  const [vCoverageUnit, setVCoverageUnit] = useState<CoverageUnit | "">("");

  const [vBusy, setVBusy] =
    useState(false);

  const [editingVariantId, setEditingVariantId] =
    useState<number | null>(null);

  const [editPrice, setEditPrice] =
    useState("");

  const cheapest =
    material.variants.length > 0
      ? Math.min(
          ...material.variants.map(
            (variant) => variant.price
          )
        )
      : null;

  async function handleAddVariant(
    e: React.FormEvent
  ) {
    e.preventDefault();

    const priceNum = parseFloat(vPrice);

    if (!vSize || isNaN(priceNum)) {
      return;
    }

    setVBusy(true);

    try {
      const updated =
        await addMaterialVariant(
          material.id,
          {
            size: vSize,
            unit: vUnit || undefined,
            price: priceNum,
            coverage_value:
              vCoverageUnit && vCoverageValue
                ? parseFloat(vCoverageValue) || undefined
                : undefined,
            coverage_unit: vCoverageUnit || undefined,
          }
        );

      onChange(updated);

      setVSize("");
      setVUnit("");
      setVPrice("");
      setVCoverageValue("");
      setVCoverageUnit("");

      setAddingVariant(false);
    } finally {
      setVBusy(false);
    }
  }

  async function handlePriceEdit(
    variantId: number
  ) {
    const priceNum = parseFloat(editPrice);

    if (isNaN(priceNum)) {
      setEditingVariantId(null);
      return;
    }

    const updated =
      await updateMaterialVariant(
        material.id,
        variantId,
        {
          price: priceNum,
        }
      );

    onChange(updated);
    setEditingVariantId(null);
  }

  async function handleDeleteVariant(
    variantId: number
  ) {
    const updated =
      await deleteMaterialVariant(
        material.id,
        variantId
      );

    onChange(updated);
  }

  async function handleSetCoverage(variantId: number) {
    const value = window.prompt(
      `Coverage amount (e.g. 32 for a sheet that covers 32 sqft)`
    );
    if (!value) return;
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      alert("Enter a positive number.");
      return;
    }

    const unitChoice = window.prompt(
      `Coverage unit — one of: ${COVERAGE_UNITS.join(", ")}`
    );
    if (!unitChoice || !COVERAGE_UNITS.includes(unitChoice as CoverageUnit)) {
      alert(`Unit must be one of: ${COVERAGE_UNITS.join(", ")}`);
      return;
    }

    const updated = await updateMaterialVariant(material.id, variantId, {
      coverage_value: num,
      coverage_unit: unitChoice as CoverageUnit,
    });

    onChange(updated);
  }

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="font-medium">
            {material.name}
          </p>

          <p className="label-mono">
            {material.category
              ? `${material.category} · `
              : ""}
            {material.variants.length} size
            {material.variants.length === 1
              ? ""
              : "s"}

            {cheapest !== null
              ? ` · from ${formatPrice(
                  cheapest
                )}`
              : ""}
          </p>
        </div>

        <span
          className="label-mono"
          style={{
            color: "var(--amber)",
          }}
        >
          {expanded ? "Hide" : "View"}
        </span>
      </button>

      {expanded && (
        <div
          className="px-4 pb-4"
          style={{
            borderTop:
              "1px solid var(--line-soft)",
          }}
        >
          {material.notes && (
            <p
              className="mt-3 text-sm"
              style={{
                color: "var(--paper-dim)",
              }}
            >
              {material.notes}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {material.variants.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center justify-between gap-2 rounded-md px-3 py-2"
                style={{
                  background:
                    "var(--surface-raised)",
                  border:
                    "1px solid var(--line-soft)",
                }}
              >
                <div className="flex-1">
                  <p className="text-sm">
                    {variant.size}
                  </p>

                  {variant.unit && (
                    <p className="label-mono">
                      {variant.unit}
                    </p>
                  )}

                  {variant.coverage_value && variant.coverage_unit ? (
                    <p className="label-mono" style={{ color: "var(--paper-dim)" }}>
                      covers {variant.coverage_value} {variant.coverage_unit}
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="label-mono"
                      style={{ color: "var(--red)" }}
                      onClick={() => handleSetCoverage(variant.id)}
                    >
                      no coverage set — click to add (skipped by auto-estimates until then)
                    </button>
                  )}
                </div>

                {editingVariantId === variant.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      className="field"
                      style={{
                        width: 90,
                      }}
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      value={editPrice}
                      onChange={(e) =>
                        setEditPrice(
                          e.target.value
                        )
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        handlePriceEdit(
                          variant.id
                        )
                      }
                    />

                    <button
                      onClick={() =>
                        handlePriceEdit(
                          variant.id
                        )
                      }
                      className="label-mono"
                      style={{
                        color:
                          "var(--amber)",
                      }}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingVariantId(
                        variant.id
                      );
                      setEditPrice(
                        String(
                          variant.price
                        )
                      );
                    }}
                    className="text-sm font-medium hover:text-[var(--amber)]"
                  >
                    {formatPrice(
                      variant.price
                    )}
                  </button>
                )}

                <button
                  onClick={() =>
                    handleDeleteVariant(
                      variant.id
                    )
                  }
                  className="label-mono"
                  style={{
                    color: "var(--red)",
                  }}
                  aria-label="Delete size"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {addingVariant ? (
            <form
              onSubmit={handleAddVariant}
              className="mt-3 flex flex-col gap-2"
            >
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="field"
                  placeholder="Size"
                  value={vSize}
                  onChange={(e) =>
                    setVSize(
                      e.target.value
                    )
                  }
                  required
                />

                <input
                  className="field"
                  placeholder="Unit"
                  value={vUnit}
                  onChange={(e) =>
                    setVUnit(
                      e.target.value
                    )
                  }
                />

                <div className="flex gap-1">
                  <input
                    className="field"
                    placeholder="Price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={vPrice}
                    onChange={(e) =>
                      setVPrice(
                        e.target.value
                      )
                    }
                    required
                  />

                  <button
                    type="submit"
                    disabled={vBusy}
                    className="btn-primary px-3"
                  >
                    {vBusy ? "…" : "Add"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  className="field"
                  placeholder="Coverage amount, e.g. 32"
                  type="number"
                  step="any"
                  min="0"
                  value={vCoverageValue}
                  onChange={(e) =>
                    setVCoverageValue(e.target.value)
                  }
                />

                <select
                  className="field"
                  value={vCoverageUnit}
                  onChange={(e) =>
                    setVCoverageUnit(e.target.value as CoverageUnit | "")
                  }
                >
                  <option value="">No coverage unit</option>
                  {COVERAGE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          ) : (
            <button
              onClick={() =>
                setAddingVariant(true)
              }
              className="btn-ghost mt-3 text-sm"
            >
              + Add a size/price
            </button>
          )}

          <button
            onClick={onDelete}
            className="label-mono mt-4 block"
            style={{
              color: "var(--red)",
            }}
          >
            Delete this material
          </button>
        </div>
      )}
    </div>
  );
}
