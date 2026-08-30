const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Resolve the optional native Foundation Models CLI helper.
 * Built from desktop/native/FoundationModelsHelper/main.swift
 */
function resolveHelperPath() {
  const candidates = [
    process.env.CANDER_FM_HELPER,
    path.join(__dirname, "../native/FoundationModelsHelper/FoundationModelsHelper"),
    path.join(
      process.resourcesPath || "",
      "FoundationModelsHelper",
      "FoundationModelsHelper",
    ),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function runHelper(args, { stdinText = null, timeoutMs = 120_000 } = {}) {
  const helper = resolveHelperPath();
  if (!helper) {
    return Promise.resolve({
      available: false,
      reason: "helper_missing",
      streaming: false,
      message:
        "Desktop Apple Intelligence helper is not installed. Build desktop/native/FoundationModelsHelper or use Cloud/Auto.",
    });
  }

  return new Promise((resolve) => {
    const child = spawn(helper, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        available: false,
        reason: "timeout",
        streaming: false,
        message: "On-device model timed out.",
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        available: false,
        reason: "spawn_error",
        streaming: false,
        message: err.message || "Could not start Foundation Models helper.",
      });
    });
    child.on("close", () => {
      clearTimeout(timer);
      const raw = (stdout || stderr || "").trim();
      try {
        const parsed = JSON.parse(raw.split("\n").filter(Boolean).pop() || "{}");
        resolve(parsed);
      } catch {
        resolve({
          available: false,
          reason: "parse_error",
          streaming: false,
          message: raw || "Helper returned unreadable output.",
        });
      }
    });

    if (stdinText != null) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}

async function getAvailability() {
  if (process.platform !== "darwin") {
    return {
      available: false,
      reason: "unsupported_platform",
      streaming: false,
      message: "Apple Foundation Models are only available on macOS.",
    };
  }
  const result = await runHelper(["availability"], { timeoutMs: 15_000 });
  return {
    available: Boolean(result.available),
    reason: String(result.reason || (result.available ? "available" : "unavailable")),
    streaming: Boolean(result.streaming),
    message:
      String(result.message || "") ||
      (result.available
        ? "On-device model ready."
        : "On-device model unavailable."),
  };
}

async function generate({ prompt, instructions }) {
  if (process.platform !== "darwin") {
    throw new Error("Apple Foundation Models are only available on macOS.");
  }
  const payload = JSON.stringify({
    prompt: String(prompt || ""),
    ...(instructions?.trim() ? { instructions: String(instructions.trim()) } : {}),
  });
  const result = await runHelper(["generate"], {
    stdinText: payload,
    timeoutMs: 180_000,
  });
  const content = String(result.content || "").trim();
  if (!content) {
    throw new Error(
      String(result.message || result.error || "On-device model returned an empty reply."),
    );
  }
  return { content, runtime: "apple-local" };
}

async function generateStructured({ prompt, instructions }) {
  if (process.platform !== "darwin") {
    throw new Error("Apple Foundation Models are only available on macOS.");
  }
  const payload = JSON.stringify({
    prompt: String(prompt || ""),
    ...(instructions?.trim() ? { instructions: String(instructions.trim()) } : {}),
  });
  const result = await runHelper(["generate-structured"], {
    stdinText: payload,
    timeoutMs: 180_000,
  });
  if (result.error && !result.structured) {
    throw new Error(String(result.message || result.error || "Structured generation failed."));
  }
  return {
    ...result,
    structured: Boolean(result.structured),
    runtime: "apple-local",
  };
}

module.exports = {
  getAvailability,
  generate,
  generateStructured,
  resolveHelperPath,
};
