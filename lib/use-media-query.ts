"use client";

import { useEffect, useState } from "react";

/** SSR-safe matchMedia; defaults to `false` until hydrated. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** Shell mobile breakpoint — matches Tailwind `max-lg` / below 1024px. */
export function useMobileShell() {
  return useMediaQuery("(max-width: 1023px)");
}
