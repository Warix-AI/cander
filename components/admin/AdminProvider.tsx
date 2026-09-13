"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  panelCollapsed: boolean;
  setPanelCollapsed: (v: boolean) => void;
  panelImmersive: boolean;
  setPanelImmersive: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelImmersive, setPanelImmersive] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [history, setHistory] = useState<AdminSection[]>([sectionFromLocation()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef({ stack: [sectionFromLocation()] as AdminSection[], index: 0 });
  historyRef.current = { stack: history, index: historyIndex };

  const setSection = useCallback((next: AdminSection) => {
    setSectionState(next);
    const { stack, index } = historyRef.current;
    const trimmed = stack.slice(0, index + 1);
    if (trimmed[trimmed.length - 1] === next) {
      // no-op history
    } else {
      const updated = [...trimmed, next];
      setHistory(updated);
      setHistoryIndex(updated.length - 1);
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.pathname = "/admin";
      url.searchParams.set("section", next);
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const goBack = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index <= 0) return;
    const nextIdx = index - 1;
    const next = stack[nextIdx];
    if (!next) return;
    setHistoryIndex(nextIdx);
    setSectionState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.pathname = "/admin";
      url.searchParams.set("section", next);
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const goForward = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index >= stack.length - 1) return;
    const nextIdx = index + 1;
    const next = stack[nextIdx];
    if (!next) return;
    setHistoryIndex(nextIdx);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      panelCollapsed,
      setPanelCollapsed,
      panelImmersive,
      setPanelImmersive,
      searchOpen,
      setSearchOpen,
      canGoBack: historyIndex > 0,
      canGoForward: historyIndex < history.length - 1,
      goBack,
      goForward,
      fetchJson,
    }),
    [
      section,
      setSection,
      selectedAccountId,
      mobileSurface,
      navCollapsed,
      panelCollapsed,
      panelImmersive,
      searchOpen,
      historyIndex,
      history.length,
      goBack,
      goForward,
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
