import type { HostingMode, ProductId, Theme } from "@/lib/types";

type Listener = () => void;

const workspaceListeners = new Set<Listener>();
let workspaceId = "marketing";

function emitWorkspace() {
  workspaceListeners.forEach((listener) => listener());
}

export function subscribeWorkspace(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-workspace");
    if (stored === "marketing" || stored === "engineering" || stored === "operations") {
      workspaceId = stored;
    }
  }
  workspaceListeners.add(listener);
  return () => {
    workspaceListeners.delete(listener);
  };
}

export function getWorkspaceSnapshot() {
  return workspaceId;
}

export function getWorkspaceServerSnapshot() {
  return "marketing";
}

export function persistWorkspace(next: string) {
  workspaceId = next;
  window.localStorage.setItem("courier-workspace", next);
  emitWorkspace();
}

const productListeners = new Set<Listener>();
let product: ProductId = "courier";

function emitProduct() {
  productListeners.forEach((listener) => listener());
}

export function subscribeProduct(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-product");
    if (stored === "courier" || stored === "platform") {
      product = stored;
    }
  }
  productListeners.add(listener);
  return () => {
    productListeners.delete(listener);
  };
}

export function getProductSnapshot() {
  return product;
}

export function getProductServerSnapshot(): ProductId {
  return "courier";
}

export function persistProduct(next: ProductId) {
  product = next;
  window.localStorage.setItem("courier-product", next);
  emitProduct();
}

export function subscribeTheme(listener: Listener) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("storage", listener);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", listener);
  };
}

export function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function getThemeServerSnapshot(): Theme {
  return "dark";
}

export function persistTheme(next: Theme) {
  document.documentElement.classList.toggle("dark", next === "dark");
  window.localStorage.setItem("theme", next);
}

const hostingListeners = new Set<Listener>();
let hostingMode: HostingMode = "cloud";

function emitHosting() {
  hostingListeners.forEach((listener) => listener());
}

export function subscribeHosting(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-hosting");
    if (stored === "cloud" || stored === "local" || stored === "on-device") {
      hostingMode = stored;
    }
  }
  hostingListeners.add(listener);
  return () => {
    hostingListeners.delete(listener);
  };
}

export function getHostingSnapshot() {
  return hostingMode;
}

export function getHostingServerSnapshot(): HostingMode {
  return "cloud";
}

export function persistHosting(next: HostingMode) {
  hostingMode = next;
  window.localStorage.setItem("courier-hosting", next);
  emitHosting();
}

const apiListeners = new Set<Listener>();
let apiEnabled = true;

function emitApi() {
  apiListeners.forEach((listener) => listener());
}

export function subscribeApi(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-api");
    if (stored === "on") apiEnabled = true;
    if (stored === "off") apiEnabled = false;
  }
  apiListeners.add(listener);
  return () => {
    apiListeners.delete(listener);
  };
}

export function getApiSnapshot() {
  return apiEnabled;
}

export function getApiServerSnapshot() {
  return true;
}

export function persistApi(next: boolean) {
  apiEnabled = next;
  window.localStorage.setItem("courier-api", next ? "on" : "off");
  emitApi();
}
