"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getToken, clearToken, apiLogout, getMe, login, type User } from "@/lib/api";

export type AuthContextType = {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  login: typeof login;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Lazy initializer: if there's no token, we're not going to fetch anything,
  // so "loading" should start false rather than being set to false via a
  // setState call inside the effect below.
  const [loading, setLoading] = useState<boolean>(() => !!getToken());
  const router = useRouter();

  const fetchCurrentUser = async () => {
    // No token: nothing to fetch. Callers (the mount effect, and
    // refreshUser after login) are responsible for the no-token case so
    // this function never needs to set state before its first `await`.
    try {
      const userData = await getMe();
      setUser(userData);
    } catch (err) {
      console.error("Failed to load user:", err);
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch-on-mount: a legitimate effect use per React's own docs. The
    // lint rule flags this because fetchCurrentUser eventually calls
    // setState, but it does so only after an await (or not at all, if
    // there's no token) — not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (getToken()) fetchCurrentUser();
  }, []);

  const logout = () => {
    apiLogout();
    setUser(null);
    router.push("/login");
  };

  const refreshUser = async () => {
    await fetchCurrentUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
