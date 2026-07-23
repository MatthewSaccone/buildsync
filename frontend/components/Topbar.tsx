"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Topbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const links = [
    { href: "/projects", label: "Projects" },
    { href: "/materials", label: "Materials" },
  ];

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: "var(--ink)",
        borderColor: "var(--line)",
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
        <Link
          href="/projects"
          className="flex items-center gap-3"
        >
          <span
            className="label-mono"
            style={{
              color: "var(--amber)",
              letterSpacing: "0.12em",
            }}
          >
            BuildSync
          </span>
        </Link>

        <nav className="flex items-center gap-5">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className="label-mono transition-colors"
                style={{
                  color: active
                    ? "var(--amber)"
                    : "var(--paper-dim)",
                }}
              >
                {link.label}
              </Link>
            );
          })}

          {user && (
            <button
              onClick={logout}
              className="label-mono transition-colors"
              style={{
                color: "var(--paper-dim)",
              }}
            >
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
