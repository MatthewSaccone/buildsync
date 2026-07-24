"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, signup, ApiError, type UserRole } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "general_contractor", label: "General Contractor" },
  { value: "architect", label: "Architect" },
  { value: "builder", label: "Builder" },
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "hvac", label: "HVAC" },
  { value: "framer", label: "Framer" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<UserRole>("general_contractor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { refreshUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const names = fullName.trim().split(" ");

        await signup({
          email,
          password,
          first_name: names[0],
          last_name: names.slice(1).join(" ") || undefined,
          company_name: companyName || undefined,
          role,
        });
      }
      await login({
        email,
        password,
      });
      await refreshUser();
      router.push("/projects");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-sm"
            style={{ background: "var(--amber)", color: "#ffffff" }}
          >
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <path d="M2 14V6l6-4 6 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M6 14V9h4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}>BuildSync</h1>
          <p className="label-mono">Click a spot. Leave an issue. Thread the conversation.</p>
        </div>

        <div className="panel p-6">
          <div className="mb-5 flex gap-1 rounded-sm p-1" style={{ background: "var(--ink)" }}>
            <button
              type="button"
              onClick={() => setMode("login")}
              className="flex-1 rounded-sm py-1.5 text-sm font-medium transition-colors"
              style={{
                background: mode === "login" ? "var(--ink-3)" : "transparent",
                color: mode === "login" ? "var(--paper)" : "var(--paper-dim)",
              }}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="flex-1 rounded-sm py-1.5 text-sm font-medium transition-colors"
              style={{
                background: mode === "signup" ? "var(--ink-3)" : "transparent",
                color: mode === "signup" ? "var(--paper)" : "var(--paper-dim)",
              }}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <>
                <div>
                  <label className="label-mono mb-1 block">Full name</label>
                  <input
                    className="field"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label-mono mb-1 block">Company (optional)</label>
                  <input
                    className="field"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label-mono mb-1 block">Trade / role</label>
                  <select
                    className="field"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="label-mono mb-1 block">Email</label>
              <input
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label-mono mb-1 block">Password</label>
              <input
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--red)" }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary mt-2">
              {busy ? "Working…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
