"use client";

import { useEffect } from "react";

/** Ensures marketing pages scroll even if a prior app modal locked body overflow. */
export function MarketingScrollUnlock() {
  useEffect(() => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);
  return null;
}
