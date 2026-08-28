/** Human-readable age for ISO timestamps. Passes through already-formatted labels. */
export function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function editedMeta(updatedAt: string, creator?: string | null) {
  const edited = `Edited ${formatRelativeTime(updatedAt)}`;
  return creator ? `${edited} · ${creator}` : edited;
}
