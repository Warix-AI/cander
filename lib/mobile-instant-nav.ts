/** Skip pager animation for one frame when swapping mobile routes. */
export function markMobileInstantNav() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.mobileInstantNav = "";
  window.requestAnimationFrame(() => {
    delete document.documentElement.dataset.mobileInstantNav;
  });
}

export function isMobileInstantNav() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.hasAttribute("data-mobile-instant-nav")
  );
}
