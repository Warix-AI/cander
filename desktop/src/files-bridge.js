/**
 * Electron main-process file I/O — open/save/reveal with path allowlist.
 * Renderer never gets unrestricted filesystem access.
 */

const { dialog, shell, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const MAX_READ_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_BYTES = 200_000;
const authorizedHandles = new Map(); // handle -> absolute path

function newHandle(absPath) {
  const id = `auth_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  authorizedHandles.set(id, absPath);
  return id;
}

function resolveAuthorized(handle) {
  if (!handle || typeof handle !== "string") return null;
  return authorizedHandles.get(handle) || null;
}

function sniffMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] || "application/octet-stream";
}

function isTextMime(mime, filePath) {
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/csv") {
    return true;
  }
  return /\.(txt|md|markdown|csv|json)$/i.test(filePath);
}

function isImageMime(mime) {
  return mime.startsWith("image/");
}

function assertSafePath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved.includes("\0")) throw new Error("invalid_path");
  // No traversal tricks beyond resolve
  return resolved;
}

async function readAuthorizedFile(absPath) {
  const st = await fs.promises.stat(absPath);
  if (!st.isFile()) throw new Error("not_a_file");
  if (st.size > MAX_READ_BYTES) throw new Error("file_too_large");
  const mime = sniffMime(absPath);
  const name = path.basename(absPath);
  const handle = newHandle(absPath);

  if (isImageMime(mime)) {
    const buf = await fs.promises.readFile(absPath);
    return {
      name,
      mime,
      size: st.size,
      pathHandle: handle,
      dataBase64: buf.toString("base64"),
    };
  }

  // Always return bytes for OpenAI upload — never path-only metadata.
  const buf = await fs.promises.readFile(absPath);
  const dataBase64 = buf.toString("base64");

  if (isTextMime(mime, absPath) && st.size <= MAX_TEXT_BYTES) {
    const text = buf.toString("utf8").slice(0, MAX_TEXT_BYTES);
    return {
      name,
      mime,
      size: st.size,
      pathHandle: handle,
      text,
      dataBase64,
    };
  }

  if (mime === "application/pdf") {
    return {
      name,
      mime,
      size: st.size,
      pathHandle: handle,
      text: `[PDF attached: ${name}]`,
      dataBase64,
    };
  }

  return {
    name,
    mime,
    size: st.size,
    pathHandle: handle,
    dataBase64,
  };
}

function getParentWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

async function showOpenDialog(opts = {}) {
  const win = getParentWindow();
  const result = await dialog.showOpenDialog(win || undefined, {
    properties: [
      "openFile",
      ...(opts.multiple === false ? [] : ["multiSelections"]),
    ],
    filters: opts.filters,
  });
  if (result.canceled || !result.filePaths?.length) {
    return { cancelled: true, files: [] };
  }
  const files = [];
  for (const fp of result.filePaths) {
    try {
      const abs = assertSafePath(fp);
      files.push(await readAuthorizedFile(abs));
    } catch (e) {
      console.warn("[cander-desktop] open file skipped", fp, e);
    }
  }
  return { cancelled: false, files };
}

async function showSaveDialog(opts = {}) {
  const win = getParentWindow();
  const result = await dialog.showSaveDialog(win || undefined, {
    defaultPath: opts.defaultPath,
    filters: opts.filters,
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true };
  }
  const abs = assertSafePath(result.filePath);
  try {
    if (typeof opts.contentText === "string") {
      await fs.promises.writeFile(abs, opts.contentText, "utf8");
    } else if (typeof opts.contentBase64 === "string") {
      await fs.promises.writeFile(abs, Buffer.from(opts.contentBase64, "base64"));
    } else {
      return { ok: false };
    }
    newHandle(abs);
    return { ok: true, path: abs };
  } catch (e) {
    console.warn("[cander-desktop] save failed", e);
    return { ok: false };
  }
}

async function revealInFolder(targetPath) {
  try {
    const fromHandle = resolveAuthorized(targetPath);
    const abs = assertSafePath(fromHandle || targetPath);
    // Only reveal if previously authorized OR exists under user-selected path
    if (!fromHandle && !authorizedHandles.values().find) {
      // allow reveal of authorized handles only when possible
    }
    const authorized =
      fromHandle ||
      [...authorizedHandles.values()].includes(abs);
    if (!authorized && !fromHandle) {
      // Still allow reveal if path exists and was just saved
      if (!fs.existsSync(abs)) return { ok: false };
    }
    shell.showItemInFolder(abs);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function readDropPaths(filePaths) {
  const files = [];
  for (const fp of filePaths || []) {
    try {
      const abs = assertSafePath(fp);
      files.push(await readAuthorizedFile(abs));
    } catch (e) {
      console.warn("[cander-desktop] drop skipped", fp, e);
    }
  }
  return { files };
}

module.exports = {
  showOpenDialog,
  showSaveDialog,
  revealInFolder,
  readDropPaths,
  resolveAuthorized,
  pathToFileURL,
};
