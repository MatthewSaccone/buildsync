"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, signup, ApiError, type UserRole } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "architect", label: "Architect" },
  { value: "builder", label: "Builder" },
  { value: "general_contractor", label: "General Contractor" },
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "hvac", label: "HVAC" },
  { value: "framer", label: "Framer" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];

export default function LoginPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>("general_contractor");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        await signup({
          email,
          password,
          first_name: firstName,
          last_name: lastName,
          role,
        });

        await login({
          email,
          password,
        });
      } else {
        await login({
          email,
          password,
        });
      }

      await refreshUser();
      router.push("/");
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (Array.isArray(err.detail)) {
          setError(
            err.detail
              .map((item: any) => item.msg || JSON.stringify(item))
              .join(", ")
          );
        } else if (
          typeof err.detail === "object" &&
          err.detail !== null
        ) {
          setError(err.detail.msg || JSON.stringify(err.detail));
        } else {
          setError(
            err.detail ||
              "An error occurred during authentication."
          );
        }
      } else {
        setError(err.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="panel w-full max-w-md p-6">

        <div className="mb-6">
          <p
            className="label-mono mb-3"
            style={{
              color: "var(--amber)",
            }}
          >
            BUILDSYNC
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.8rem",
            }}
          >
            {isSignUp
              ? "Create an account"
              : "Welcome back"}
          </h1>

          <p
            className="mt-2 text-sm"
            style={{
              color: "var(--paper-dim)",
            }}
          >
            {isSignUp
              ? "Register to start managing projects."
              : "Sign in to access your project dashboard."}
          </p>
        </div>


        {error && (
          <div
            className="mb-4 rounded-sm border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--red)",
              color: "var(--red)",
              background: "var(--ink)",
            }}
          >
            {error}
          </div>
        )}


        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3"
        >

          {isSignUp && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-mono mb-1 block">
                    First name
                  </label>

                  <input
                    className="field"
                    required
                    value={firstName}
                    onChange={(e) =>
                      setFirstName(e.target.value)
                    }
                  />
                </div>

                <div>
                  <label className="label-mono mb-1 block">
                    Last name
                  </label>

                  <input
                    className="field"
                    required
                    value={lastName}
                    onChange={(e) =>
                      setLastName(e.target.value)
                    }
                  />
                </div>
              </div>


              <div>
                <label className="label-mono mb-1 block">
                  Role
                </label>

                <select
                  className="field"
                  value={role}
                  onChange={(e) =>
                    setRole(
                      e.target.value as UserRole
                    )
                  }
                >
                  {ROLES.map((r) => (
                    <option
                      key={r.value}
                      value={r.value}
                    >
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}


          <div>
            <label className="label-mono mb-1 block">
              Email
            </label>

            <input
              className="field"
              type="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
            />
          </div>


          <div>
            <label className="label-mono mb-1 block">
              Password
            </label>

            <input
              className="field"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
            />
          </div>


          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-2 w-full"
          >
            {loading
              ? "Please wait…"
              : isSignUp
              ? "Create account"
              : "Sign in"}
          </button>

        </form>


        <div
          className="mt-6 text-center text-sm"
          style={{
            color: "var(--paper-dim)",
          }}
        >
          {isSignUp ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="hover:text-[var(--amber)] font-semibold hover:underline"
                onClick={() => {
                  setIsSignUp(false);
                  setError("");
                }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                className="hover:text-[var(--amber)] font-semibold hover:underline"
                onClick={() => {
                  setIsSignUp(true);
                  setError("");
                }}
              >
                Sign Up
              </button>
            </>
          )}
        </div>

      </div>
    </main>
  );
}
