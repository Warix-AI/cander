"use client";

import { useEffect } from "react";
import { useApp } from "@/components/app/AppProvider";

/**
 * Legacy overlay bridge — routes `openOverlay("search")` to the dedicated
 * Search screen so old call sites keep working.
 */
export function SearchModal() {
  const { overlay, closeOverlay, openSearch } = useApp();

  useEffect(() => {
    if (overlay !== "search") return;
    closeOverlay();
    openSearch();
  }, [overlay, closeOverlay, openSearch]);

  return null;
}
