"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { updateProfile, changePassword, ApiError, type UserRole } from "@/lib/api";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "architect", label: "Architect" },
  { value: "builder", label: "Builder" },
  { value: "general_contractor", label: "General contractor" },
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "hvac", label: "HVAC" },
  { value: "framer", label: "Framer" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];

export default function AccountSettingsPanel() {
  const { user, refreshUser } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [companyName, setCompanyName] = useState(user?.company_name ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "other");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  if (!user) return null;

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        company_name: companyName.trim() || null,
        role,
        phone: phone.trim() || null,
      });
      await refreshUser();
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Couldn't save your changes.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Couldn't update your password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Profile */}
      <section>
        <h2 className="label-mono mb-3">Profile</h2>
        <form onSubmit={handleProfileSubmit} className="panel flex max-w-md flex-col gap-3 p-4">
          <label className="flex flex-col gap-1">
            <span className="label-mono">Full name</span>
            <input
              className="field"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setProfileSaved(false);
              }}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-mono">Email</span>
            <input className="field" value={user.email} disabled style={{ opacity: 0.6 }} />
            <span className="text-xs" style={{ color: "var(--paper-dim)" }}>
              Contact support to change the email on your account.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-mono">Company</span>
            <input
              className="field"
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                setProfileSaved(false);
              }}
              placeholder="Optional"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-mono">Role</span>
            <select
              className="field"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as UserRole);
                setProfileSaved(false);
              }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-mono">Phone</span>
            <input
              className="field"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setProfileSaved(false);
              }}
              placeholder="Optional"
            />
          </label>

          {profileError && (
            <p className="text-xs" style={{ color: "var(--red)" }}>
              {profileError}
            </p>
          )}
          {profileSaved && !profileError && (
            <p className="text-xs" style={{ color: "var(--green)" }}>
              Saved.
            </p>
          )}

          <button type="submit" disabled={profileSaving} className="btn-primary mt-1 w-fit text-sm">
            {profileSaving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      {/* Password */}
      <section>
        <h2 className="label-mono mb-3">Password</h2>
        <form onSubmit={handlePasswordSubmit} className="panel flex max-w-md flex-col gap-3 p-4">
          <label className="flex flex-col gap-1">
            <span className="label-mono">Current password</span>
            <input
              className="field"
              type="password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setPasswordSaved(false);
              }}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-mono">New password</span>
            <input
              className="field"
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordSaved(false);
              }}
              required
              minLength={8}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-mono">Confirm new password</span>
            <input
              className="field"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordSaved(false);
              }}
              required
              minLength={8}
            />
          </label>

          {passwordError && (
            <p className="text-xs" style={{ color: "var(--red)" }}>
              {passwordError}
            </p>
          )}
          {passwordSaved && !passwordError && (
            <p className="text-xs" style={{ color: "var(--green)" }}>
              Password updated. Your other sessions have been signed out.
            </p>
          )}

          <button type="submit" disabled={passwordSaving} className="btn-primary mt-1 w-fit text-sm">
            {passwordSaving ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
