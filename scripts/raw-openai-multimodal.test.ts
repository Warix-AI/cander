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
import {
  isOpenAIImageGenerationEnabled,
  openAIImageGenerationTool,
  detectImageGenerationIntent,
} from "../lib/ai/raw-openai/image-generation.ts";
import { isOpenAIWebSearchEnabled } from "../lib/ai/raw-openai/web-search.ts";
import { resolveAssistantRuntimePath } from "../lib/ai/raw-openai/path.ts";

describe("Composer attach actions by platform", () => {
  it("desktop web: single Upload for images + files", () => {
    assert.deepEqual(
      composerAttachActions({ nativeCapacitor: false, mobileShell: false }),
      ["upload"],
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
    assert.equal(resolveAssistantRuntimePath(), "openai");
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
      "lib/native/save-image.ts",
      "components/chat/AssistantMessage.tsx",
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

  it("openai-dictation uses MediaRecorder + transcribe helper only", () => {
    const src = fs.readFileSync("lib/voice/openai-dictation.ts", "utf8");
    assert.ok(src.includes("MediaRecorder"));
    assert.ok(src.includes("transcribeRawOpenAIAudio"));
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

  it("image_generation tool is wired when flag enabled", () => {
    const prev = process.env.OPENAI_IMAGE_GENERATION;
    const prevModel = process.env.OPENAI_IMAGE_MODEL;
    const prevQuality = process.env.OPENAI_IMAGE_QUALITY;
    process.env.OPENAI_IMAGE_GENERATION = "1";
    delete process.env.OPENAI_IMAGE_MODEL;
    delete process.env.OPENAI_IMAGE_QUALITY;
    assert.equal(isOpenAIImageGenerationEnabled(), true);
    assert.deepEqual(openAIImageGenerationTool(), {
      type: "image_generation",
      model: "gpt-image-1.5",
      quality: "medium",
      action: "generate",
    });
    process.env.OPENAI_IMAGE_GENERATION = "0";
    assert.equal(isOpenAIImageGenerationEnabled(), false);
    if (prev === undefined) delete process.env.OPENAI_IMAGE_GENERATION;
    else process.env.OPENAI_IMAGE_GENERATION = prev;
    if (prevModel === undefined) delete process.env.OPENAI_IMAGE_MODEL;
    else process.env.OPENAI_IMAGE_MODEL = prevModel;
    if (prevQuality === undefined) delete process.env.OPENAI_IMAGE_QUALITY;
    else process.env.OPENAI_IMAGE_QUALITY = prevQuality;

    const route = fs.readFileSync("app/api/ai/raw-openai/route.ts", "utf8");
    assert.ok(route.includes("openAIImageGenerationTool"));
    assert.ok(route.includes("extractGeneratedImages"));
    assert.ok(route.includes("detectImageGenerationIntent"));
    assert.ok(route.includes("generateImageViaImagesApi"));
    assert.ok(route.includes("tool_choice"));
    const toolSrc = fs.readFileSync(
      "lib/ai/raw-openai/image-generation.ts",
      "utf8",
    );
    assert.ok(toolSrc.includes('"image_generation"'));
    assert.ok(toolSrc.includes("gpt-image-1.5"));
    assert.ok(toolSrc.includes("medium"));
  });

  it("detects image generation intent vs meta questions", () => {
    assert.equal(
      detectImageGenerationIntent("Generate me an image of the capital of Utah."),
      true,
    );
    assert.equal(
      detectImageGenerationIntent("Create a cartoon dog wearing sunglasses."),
      true,
    );
    assert.equal(
      detectImageGenerationIntent("Draw a sunset over the mountains"),
      true,
    );
    assert.equal(
      detectImageGenerationIntent(
        "Go ahead and generate me a baseball field with the Wasatch Mountains in the back.",
      ),
      true,
    );
    assert.equal(
      detectImageGenerationIntent("make a poster for the concert", {
        space: "studio",
      }),
      true,
    );
    assert.equal(
      detectImageGenerationIntent("What model do you use to generate images?"),
      false,
    );
    assert.equal(
      detectImageGenerationIntent("How does image generation work?"),
      false,
    );
  });

  it("normalize keeps file blob bytes for OpenAI upload", () => {
    const src = fs.readFileSync("lib/native/normalize.ts", "utf8");
    assert.ok(src.includes("keep bytes for OpenAI"));
    assert.ok(src.includes("OpenAI receives actual PDF bytes via blob"));
    assert.match(src, /size: blob\.size,\n\s*blob,/);
  });

  it("Electron files bridge always returns dataBase64 bytes", () => {
    const src = fs.readFileSync("desktop/src/files-bridge.js", "utf8");
    assert.ok(src.includes("Always return bytes"));
    assert.ok(src.includes("dataBase64"));
    assert.equal(src.includes("metadata + handle only"), false);
  });

  it("upload route supports pending attachments without message_id", () => {
    const src = fs.readFileSync(
      "app/api/ai/raw-openai/upload/route.ts",
      "utf8",
    );
    assert.ok(src.includes('status: "pending"'));
    assert.ok(src.includes("message_id: null"));
    assert.ok(src.includes('status: "attached"'));
  });

  it("generated images render with download control and Photos save path", () => {
    const ui = fs.readFileSync("components/chat/AssistantMessage.tsx", "utf8");
    const card = fs.readFileSync("components/chat/ImageGenerationCard.tsx", "utf8");
    assert.ok(ui.includes("ImageGenerationCard"));
    assert.ok(ui.includes("ImageGenerationJobBlock"));
    assert.ok(ui.includes("image_generation"));
    assert.ok(card.includes("MeshDriftShader"));
    assert.ok(card.includes("object-cover"));
    assert.equal(ui.includes("CanderActivityMark"), false);
    assert.ok(card.includes("saveGeneratedImage"));
    assert.ok(card.includes("pointer-events-none"));
    assert.ok(ui.includes("retryImageGeneration"));
    assert.ok(!ui.includes("cancelImageGeneration"));
    assert.ok(card.includes("Download"));
    const thinking = fs.readFileSync(
      "components/chat/ThinkingIndicator.tsx",
      "utf8",
    );
    assert.ok(thinking.includes("CanderActivityMark"));
    assert.ok(thinking.includes("transition-opacity"));
    assert.equal(thinking.includes("formatTurnActivityLine"), false);
    const composer = fs.readFileSync(
      "components/shell/ComposerVoice.tsx",
      "utf8",
    );
    assert.ok(composer.includes("ComposerStopButton"));
    assert.ok(composer.includes("turnActive"));
    const chatCol = fs.readFileSync("components/shell/ChatColumn.tsx", "utf8");
    assert.equal(chatCol.includes("homeSuggestions"), false);
    assert.equal(chatCol.includes("landing-suggestion"), false);
    const save = fs.readFileSync("lib/native/save-image.ts", "utf8");
    assert.ok(save.includes("CanderPhotos"));
    assert.ok(save.includes("photos"));
    assert.ok(save.includes("share"));
    assert.equal(save.includes("OPENAI_API_KEY"), false);
    const plugin = fs.readFileSync(
      "mobile/ios/App/App/CanderPhotosPlugin.swift",
      "utf8",
    );
    assert.ok(plugin.includes("PHPhotoLibrary"));
    assert.ok(plugin.includes("addOnly"));
  });
});
