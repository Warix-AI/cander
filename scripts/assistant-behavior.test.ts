/**
 * Focused tests for assistant behavior, clarification, and tools.
 * Run: npm run test:assistant
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANDER_ASSISTANT_BEHAVIOR,
  CANDER_NO_REGREET,
  buildDialoguePrompt,
  hasPriorConversationTurns,
} from "../lib/ai/assistant-behavior.ts";
import {
  createClarificationCard,
  formatClarificationAnswersForModel,
  validateAllClarificationAnswers,
  validateClarificationStep,
  validateQuestionAnswer,
} from "../lib/ai/clarification/schema.ts";
import {
  parseToolCallFromContent,
} from "../lib/ai/tool-protocol.ts";
import {
  getAiTool,
  validateToolArguments,
} from "../lib/ai/tools/registry.ts";

describe("conversation continuity helpers", () => {
  it("detects prior turns and builds dialogue prompts", () => {
    assert.equal(hasPriorConversationTurns([]), false);
    assert.equal(
      hasPriorConversationTurns([{ role: "user", content: "Hi" }]),
      true,
    );
    const prompt = buildDialoguePrompt(
      [
        { role: "user", content: "First" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Second" },
      ],
      "Second",
    );
    assert.match(prompt, /Conversation so far/);
    assert.match(prompt, /Latest user message:\nSecond/);
    assert.ok(!prompt.endsWith("User: Second\n\nLatest"));
  });

  it("keeps chats isolated by only using provided history", () => {
    const a = buildDialoguePrompt(
      [{ role: "user", content: "Thread A secret" }],
      "ping",
    );
    const b = buildDialoguePrompt(
      [{ role: "user", content: "Thread B secret" }],
      "ping",
    );
    assert.match(a, /Thread A secret/);
    assert.doesNotMatch(a, /Thread B/);
    assert.match(b, /Thread B secret/);
    assert.doesNotMatch(b, /Thread A/);
  });

  it("behavior prompt discourages repeated self-introductions", () => {
    assert.match(CANDER_ASSISTANT_BEHAVIOR, /Do not repeatedly introduce yourself/);
    assert.match(CANDER_NO_REGREET, /Do not greet/);
    const withHistory = hasPriorConversationTurns([
      { role: "user", content: "yo" },
      { role: "assistant", content: "hey" },
    ]);
    assert.equal(withHistory, true);
  });
});

describe("clarification cards", () => {
  it("validates required fields and multi-step navigation state", () => {
    const card = createClarificationCard({
      threadId: "t1",
      title: "New project",
      questions: [
        {
          id: "name",
          type: "text",
          label: "Project name",
          required: true,
        },
        {
          id: "type",
          type: "single_choice",
          label: "Type",
          required: true,
          choices: [
            { id: "website", label: "Website" },
            { id: "app", label: "App" },
          ],
        },
      ],
    });
    assert.equal(card.stepIndex, 0);
    const stepErrors = validateClarificationStep(card, ["name"]);
    assert.equal(stepErrors.name, "This field is required.");

    card.answers.name = "Acme";
    card.answers.type = "website";
    assert.equal(validateQuestionAnswer(card.questions[1]!, "nope"), "Pick one of the listed options.");
    assert.deepEqual(validateAllClarificationAnswers(card), {});

    const result = {
      cardId: card.id,
      title: card.title,
      answers: card.answers,
      skipped: false,
      resumeTool: "project.create",
    };
    assert.match(formatClarificationAnswersForModel(result), /Acme/);
    assert.match(formatClarificationAnswersForModel(result), /website/);
  });
});

describe("tools", () => {
  it("validates tool arguments and requires confirmation flag on ui.confirm", () => {
    const create = getAiTool("project.create");
    assert.ok(create?.enabled);
    const bad = validateToolArguments(create!, {});
    assert.equal(bad.ok, false);

    const good = validateToolArguments(create!, {
      title: "Demo",
      space: "build",
    });
    assert.equal(good.ok, true);

    const confirm = getAiTool("ui.confirm");
    assert.equal(confirm?.permission.requiresConfirmation, true);
    const confirmArgs = validateToolArguments(confirm!, {
      title: "Delete?",
      message: "This cannot be undone.",
    });
    assert.equal(confirmArgs.ok, true);
  });

  it("parses trailing tool JSON from model output", () => {
    const { text, call } = parseToolCallFromContent(
      'Sure — opening Build.\n{"tool":"nav.open","arguments":{"target":"build"}}',
    );
    assert.match(text, /opening Build/);
    assert.equal(call?.name, "nav.open");
    assert.equal(call?.arguments?.target, "build");
  });

  it("supports create-project clarification resume args shape", () => {
    const tool = getAiTool("project.create");
    assert.ok(tool);
    const merged = validateToolArguments(tool, {
      title: "Launch site",
      space: "build",
      kind: "app",
    });
    assert.equal(merged.ok, true);
  });
});
