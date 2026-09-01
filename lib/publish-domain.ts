export type PublishDomainOption = {
  id: string;
  url: string;
  label: string;
  hint: string;
};

export function slugFromProjectName(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export function buildPublishDomainOptions(opts: {
  displayName: string;
  domains?: string[];
  liveUrl?: string | null;
}): PublishDomainOption[] {
  const slug = slugFromProjectName(opts.displayName || "app");
  const hostedUrl = `https://${slug}.cander.app`;
  const custom = (opts.domains ?? []).map((domain) => {
    const label = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return {
      id: domain,
      url: domain.startsWith("http") ? domain : `https://${label}`,
      label,
      hint: "Custom domain",
    };
  });
  return [
    {
      id: "cander",
      url: opts.liveUrl?.trim() || hostedUrl,
      label: `${slug}.cander.app`,
      hint: "Verified subdomain",
    },
    ...custom,
  ];
}

export function normalizeCustomDomain(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function isValidDomain(domain: string) {
  if (!domain || domain.length > 253) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

export function resolvePublishUrl(
  options: PublishDomainOption[],
  selectedId: string,
  liveUrl?: string | null,
) {
  const chosen = options.find((item) => item.id === selectedId) ?? options[0];
  if (!chosen) return null;
  if (selectedId === "cander" && liveUrl?.trim()) return liveUrl.trim();
  return chosen.url;
}
