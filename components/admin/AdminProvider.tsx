"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ADMIN_SECTIONS,
  isAdminSection,
  type AdminSection,
} from "@/lib/admin/sections";
import { adminJson } from "@/lib/admin/client";

type AdminContextValue = {
  section: AdminSection;
  setSection: (section: AdminSection) => void;
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  mobileSurface: "menu" | "chat" | "workspace";
  setMobileSurface: (s: "menu" | "chat" | "workspace") => void;
  navCollapsed: boolean;
  setNavCollapsed: (v: boolean) => void;
  fetchJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

function sectionFromLocation(): AdminSection {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  const q = params.get("section");
  if (isAdminSection(q)) return q;
  const path = window.location.pathname.replace(/^\/admin\/?/, "");
  const seg = path.split("/")[0];
  if (isAdminSection(seg)) return seg;
  return "overview";
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [section, setSectionState] = useState<AdminSection>(sectionFromLocation);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [mobileSurface, setMobileSurface] = useState<
    "menu" | "chat" | "workspace"
  >("workspace");
  const [navCollapsed, setNavCollapsed] = useState(false);

  const setSection = useCallback((next: AdminSection) => {
    setSectionState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.pathname = "/admin";
      url.searchParams.set("section", next);
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const fetchJson = useCallback(
    <T,>(path: string, init?: RequestInit) => adminJson<T>(path, init),
    [],
  );

  const value = useMemo(
    () => ({
      section,
      setSection,
      selectedAccountId,
      setSelectedAccountId,
      mobileSurface,
      setMobileSurface,
      navCollapsed,
      setNavCollapsed,
      fetchJson,
    }),
    [
      section,
      setSection,
      selectedAccountId,
      mobileSurface,
      navCollapsed,
      fetchJson,
    ],
  );

  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin requires AdminProvider");
  return ctx;
}

export { ADMIN_SECTIONS };
