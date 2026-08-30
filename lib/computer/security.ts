const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function isAllowedComputerUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) {
      return false;
    }
    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("172.16.") ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function assertAllowedComputerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!isAllowedComputerUrl(trimmed)) {
    throw new Error("URL not allowed for computer browser.");
  }
  return trimmed;
}

const ALLOWED_EXEC_COMMANDS = new Set([
  "npm",
  "node",
  "npx",
  "cat",
  "ls",
  "mkdir",
  "sh",
]);

export function assertAllowedExecCommand(command: string): void {
  const base = command.trim().split(/\s+/)[0];
  if (!ALLOWED_EXEC_COMMANDS.has(base)) {
    throw new Error(`Command not allowed: ${command}`);
  }
}
