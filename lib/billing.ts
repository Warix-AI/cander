import { account } from "./data";
import type { HostingMode } from "./types";

export type ProductSlice = "courier" | "apis" | "both";

export const courierSeat: Record<HostingMode, number> = {
  cloud: 30,
  local: 20,
  "on-device": 10,
};

export const apiLicense: Record<HostingMode, number> = {
  cloud: 500,
  local: 300,
  "on-device": 100,
};

export const hostedApis = [
  "chat.completions",
  "embeddings",
  "images.generations",
];

export const hostingModes: {
  id: HostingMode;
  label: string;
  title: string;
  body: string;
  why: string;
  traits: string[];
  action: string;
}[] = [
  {
    id: "cloud",
    label: "Cloud",
    title: "Cloud Hosting",
    body: "Recursion AI operates the models. You call them; we run the metal.",
    why: "Highest cost — the infrastructure is on us.",
    traits: [
      "Hosted regions, we operate the runtime",
      "Same OpenAI-compatible surface",
      "No servers to license or patch",
    ],
    action: "Use Cloud Hosting",
  },
  {
    id: "local",
    label: "Local",
    title: "Local Hosting",
    body: "Your network, your machines. Other devices on the LAN can tie in.",
    why: "Mid cost — the organization supplies the server hardware.",
    traits: [
      "Licensed servers on this network",
      "Team devices share the same runtime",
      "Tokens stay on the LAN",
    ],
    action: "Configure Local Hosting",
  },
  {
    id: "on-device",
    label: "On-Device",
    title: "On-Device Hosting",
    body: "Inference runs on each person’s machine. Private, offline-capable.",
    why: "Lowest cost — compute sits on the end-user device.",
    traits: [
      "Licensed per device",
      "Nothing leaves the machine",
      "Works without a network hop",
    ],
    action: "Configure On-Device",
  },
];

export function money(n: number) {
  return `$${n.toLocaleString()}`;
}

export function hostingLabel(mode: HostingMode) {
  return hostingModes.find((item) => item.id === mode)?.title ?? "Hosting";
}

export function licensedHint(mode: HostingMode, users: number) {
  if (mode === "cloud") return "1 region · hosted by Recursion AI";
  if (mode === "local") return "2 licensed servers · office LAN";
  return `${users} licensed devices`;
}

export function billingFor(
  mode: HostingMode,
  opts?: { users?: number; courierEnabled?: boolean; apiEnabled?: boolean },
) {
  const users = opts?.users ?? account.seats;
  const courierEnabled = opts?.courierEnabled ?? true;
  const apiEnabled = opts?.apiEnabled ?? true;
  const seat = courierSeat[mode];
  const license = apiLicense[mode];
  const courier = courierEnabled ? users * seat : 0;
  const api = apiEnabled ? license : 0;
  return {
    users,
    seat,
    license,
    courier,
    api,
    total: courier + api,
    courierEnabled,
    apiEnabled,
    deployments: licensedHint(mode, users),
    apis: hostedApis,
  };
}

export function estimateFor(mode: HostingMode, users: number) {
  const seat = courierSeat[mode];
  const license = apiLicense[mode];
  return {
    seat,
    license,
    courier: users * seat,
    api: license,
    total: users * seat + license,
  };
}
