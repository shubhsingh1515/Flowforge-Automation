"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "../lib/api";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  activeWorkspaceId: string;
  workspaceName: string;
  role?: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { name: string; email: string; password: string; workspaceName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_ROUTES = ["/", "/login", "/register", "/pricing", "/status"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = async () => {
    try {
      const res = await api.auth.me();
      if (res?.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch (err: any) {
      if (err?.statusCode === 429) {
        return;
      }
      setUser(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("flowforge_token");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const isPublic = PUBLIC_ROUTES.includes(pathname);
      if (!user && !isPublic) {
        router.push("/login");
      } else if (user && (pathname === "/login" || pathname === "/register")) {
        router.push("/dashboard");
      }
    }
  }, [user, isLoading, pathname, router]);

  const login = async (credentials: { email: string; password: string }) => {
    const res = await api.auth.login(credentials);
    if (res.token && typeof window !== "undefined") {
      localStorage.setItem("flowforge_token", res.token);
    }
    setUser(res.user);
    router.push("/dashboard");
  };

  const register = async (data: { name: string; email: string; password: string; workspaceName?: string }) => {
    const res = await api.auth.register(data);
    if (res.token && typeof window !== "undefined") {
      localStorage.setItem("flowforge_token", res.token);
    }
    setUser(res.user);
    router.push("/dashboard");
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore errors during logout
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("flowforge_token");
      }
      setUser(null);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
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
