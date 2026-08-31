/**
 * Raw OpenAI multimodal — menus, build-input, limits, no Apple/Exa leakage.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildRawOpenAIInput } from "../lib/ai/raw-openai/build-input.ts";
import {
  composerAttachActions,
  validateUpload,
  MAX_IMAGE_BYTES,
  MAX_DOCUMENT_BYTES,
} from "../lib/ai/raw-openai/limits.ts";
import { isOpenAIWebSearchEnabled } from "../lib/ai/raw-openai/web-search.ts";
import { resolveAssistantRuntimePath } from "../lib/ai/raw-openai/path.ts";

describe("Composer attach actions by platform", () => {
  it("desktop web: upload image + upload file", () => {
    assert.deepEqual(
      composerAttachActions({ nativeCapacitor: false, mobileShell: false }),
      ["upload_image", "upload_file"],
    );
  });

  it("mobile web: take/choose photo + upload file", () => {
    assert.deepEqual(
      composerAttachActions({ nativeCapacitor: false, mobileShell: true }),
      ["take_photo", "choose_photo", "upload_file"],
    );
  });

  it("iOS Capacitor: take/choose photo + upload file", () => {
    assert.deepEqual(
      composerAttachActions({ nativeCapacitor: true, mobileShell: false }),
      ["take_photo", "choose_photo", "upload_file"],
    );
  });
});

describe("Upload validation", () => {
  it("accepts png/jpeg/webp images under limit", () => {
    assert.equal(
      validateUpload({ mime: "image/png", size: 1000, hint: "image" }).ok,
      true,
    );
    assert.equal(
      validateUpload({ mime: "image/jpeg", size: MAX_IMAGE_BYTES, hint: "image" })
        .ok,
      true,
    );
    assert.equal(
      validateUpload({
        mime: "image/webp",
        size: MAX_IMAGE_BYTES + 1,
        hint: "image",
      }).ok,
      false,
    );
  });

  it("accepts pdf/txt documents; rejects unsupported", () => {
    assert.equal(
      validateUpload({
        mime: "application/pdf",
        size: 1000,
        hint: "document",
      }).ok,
      true,
    );
    assert.equal(
      validateUpload({
        mime: "text/plain",
        size: MAX_DOCUMENT_BYTES,
        hint: "document",
      }).ok,
      true,
    );
    assert.equal(
      validateUpload({
        mime: "application/zip",
        size: 1000,
        hint: "document",
      }).ok,
      false,
    );
  });

  it("accepts audio for transcription MIME check", () => {
    assert.equal(
      validateUpload({ mime: "audio/webm", size: 1000, hint: "audio" }).ok,
      true,
    );
  });
});

describe("Responses input builder", () => {
  it("image + text uses input_image file_id", () => {
    const input = buildRawOpenAIInput({
      system: "sys",
      messages: [{ role: "user", content: "What's wrong with this?" }],
      attachments: [
        {
          id: "a1",
          openaiFileId: "file_img",
          attachmentType: "image",
          forCurrentTurn: true,
        },
      ],
    });
    const user = input.find((i) => i.role === "user");
    assert.ok(Array.isArray(user?.content));
    const parts = user!.content as Array<{ type: string; file_id?: string }>;
    assert.ok(parts.some((p) => p.type === "input_text"));
    assert.ok(
      parts.some((p) => p.type === "input_image" && p.file_id === "file_img"),
    );
  });

  it("file + text uses input_file file_id", () => {
    const input = buildRawOpenAIInput({
      system: "sys",
      messages: [{ role: "user", content: "Summarize this." }],
      attachments: [
        {
          id: "d1",
          openaiFileId: "file_doc",
          attachmentType: "document",
          forCurrentTurn: true,
        },
      ],
    });
    const user = input.find((i) => i.role === "user");
    const parts = user!.content as Array<{ type: string; file_id?: string }>;
    assert.ok(
      parts.some((p) => p.type === "input_file" && p.file_id === "file_doc"),
    );
  });

  it("multiple attachments on one turn", () => {
    const input = buildRawOpenAIInput({
      system: "sys",
      messages: [{ role: "user", content: "Compare these" }],
      attachments: [
        {
          id: "a1",
          openaiFileId: "file_img",
          attachmentType: "image",
          forCurrentTurn: true,
        },
        {
          id: "d1",
          openaiFileId: "file_doc",
          attachmentType: "document",
          forCurrentTurn: true,
        },
      ],
    });
    const parts = input.find((i) => i.role === "user")!
      .content as Array<{ type: string }>;
    assert.equal(parts.filter((p) => p.type === "input_image").length, 1);
    assert.equal(parts.filter((p) => p.type === "input_file").length, 1);
  });

  it("follow-ups retain prior message file_ids", () => {
    const input = buildRawOpenAIInput({
      system: "sys",
      messages: [
        { role: "user", content: "Summarize this.", id: "u1" },
        { role: "assistant", content: "Here is a summary." },
        { role: "user", content: "What about cancellation?" },
      ],
      attachments: [
        {
          id: "d1",
          openaiFileId: "file_pdf",
          attachmentType: "document",
          messageId: "u1",
        },
      ],
    });
    const firstUser = input.filter((i) => i.role === "user")[0];
    const parts = firstUser!.content as Array<{ type: string; file_id?: string }>;
    assert.ok(
      parts.some((p) => p.type === "input_file" && p.file_id === "file_pdf"),
    );
  });
});

describe("Raw multimodal isolation", () => {
  it("raw path still wins", () => {
    const prev = process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    delete process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    delete process.env.RAW_OPENAI_MODE;
    assert.equal(resolveAssistantRuntimePath(), "raw_openai");
    if (prev !== undefined) process.env.NEXT_PUBLIC_RAW_OPENAI_MODE = prev;
  });

  it("web search flag still works", () => {
    const prev = process.env.OPENAI_WEB_SEARCH;
    process.env.OPENAI_WEB_SEARCH = "1";
    assert.equal(isOpenAIWebSearchEnabled(), true);
    process.env.OPENAI_WEB_SEARCH = "0";
    assert.equal(isOpenAIWebSearchEnabled(), false);
    if (prev === undefined) delete process.env.OPENAI_WEB_SEARCH;
    else process.env.OPENAI_WEB_SEARCH = prev;
  });

  it("client raw modules never include OPENAI_API_KEY or Exa or Apple speech", () => {
    for (const rel of [
      "lib/ai/raw-openai/run-turn.ts",
      "lib/ai/raw-openai/upload-client.ts",
      "lib/ai/raw-openai/flags.ts",
      "lib/ai/raw-openai/build-input.ts",
      "lib/ai/raw-openai/limits.ts",
      "lib/voice/openai-dictation.ts",
      "components/chat/RawOpenAIModeBadge.tsx",
    ]) {
      const src = fs.readFileSync(rel, "utf8");
      assert.equal(src.includes("OPENAI_API_KEY"), false, rel);
      assert.equal(src.includes("NEXT_PUBLIC_OPENAI"), false, rel);
      assert.equal(/\bexa\b/i.test(src), false, rel);
      assert.equal(src.includes("SpeechRecognition"), false, rel);
      assert.equal(src.includes("speech-recognition"), false, rel);
      assert.equal(src.includes("Foundation Model"), false, rel);
    }
  });

  it("openai-dictation uses MediaRecorder + transcribe endpoint only", () => {
    const src = fs.readFileSync("lib/voice/openai-dictation.ts", "utf8");
    assert.ok(src.includes("MediaRecorder"));
    assert.ok(src.includes("/api/ai/raw-openai/transcribe"));
    assert.equal(src.includes("startSpeechToText"), false);
    assert.equal(src.includes("@capacitor-community/speech-recognition"), false);
  });

  it("server upload/transcribe/chat routes stay server-key only", () => {
    for (const rel of [
      "app/api/ai/raw-openai/route.ts",
      "app/api/ai/raw-openai/upload/route.ts",
      "app/api/ai/raw-openai/transcribe/route.ts",
    ]) {
      const src = fs.readFileSync(rel, "utf8");
      assert.ok(src.includes("process.env.OPENAI_API_KEY"), rel);
      assert.equal(src.includes("NEXT_PUBLIC_OPENAI_API_KEY"), false, rel);
      assert.equal(/\bexa\b/i.test(src), false, rel);
    }
  });

  it("chat route rejects foreign attachment ownership pattern", () => {
    const src = fs.readFileSync("app/api/ai/raw-openai/route.ts", "utf8");
    assert.ok(src.includes('.eq("user_id", userId)'));
    assert.ok(src.includes("403"));
  });
});
