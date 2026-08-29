/**
 * Focused tests for assistant behavior, clarification, tools, and intent shortcuts.
 * Run: npm run test:assistant
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANDER_ASSISTANT_BEHAVIOR,
  CANDER_NO_REGREET,
  buildDialoguePrompt,
  hasPriorConversationTurns,
  shouldSuppressReGreeting,
} from "../lib/ai/assistant-behavior.ts";
import {
  createClarificationCard,
  formatClarificationAnswersForDisplay,
  formatClarificationAnswersForModel,
  looksLikeBrokenCreateProjectCard,
  normalizeProjectCreateFromClarification,
  sanitizeClarificationQuestions,
  validateAllClarificationAnswers,
  validateClarificationStep,
  validateQuestionAnswer,
} from "../lib/ai/clarification/schema.ts";
import {
  parseToolCallFromContent,
  sanitizeAssistantVisibleText,
  stripToolJsonFromText,
} from "../lib/ai/tool-protocol.ts";
import {
  getAiTool,
  normalizeToolArguments,
  validateToolArguments,
} from "../lib/ai/tools/registry.ts";
import {
  matchCreateProjectIntent,
  matchNavIntent,
  matchOpenProjectIntent,
  matchTakeMeThereIntent,
} from "../lib/ai/runtime/intent-matchers.ts";
import {
  isConversationOnlyTurn,
  isInAppToolIntent,
} from "../lib/ai/tool-intent.ts";
import {
  clearThreadTaskState,
  getThreadTaskState,
  mergeCondensedSummaries,
  migrateThreadTaskState,
  upsertThreadTaskState,
} from "../lib/ai/task-state.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

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
    assert.match(CANDER_ASSISTANT_BEHAVIOR, /answer the user’s message directly/i);
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
    assert.equal(
      validateQuestionAnswer(card.questions[1]!, "nope"),
      "Pick one of the listed options.",
    );
    assert.deepEqual(validateAllClarificationAnswers(card), {});

    const result = {
      cardId: card.id,
      title: card.title,
      answers: card.answers,
      skipped: false,
      resumeTool: "project.create",
    };
    assert.match(formatClarificationAnswersForModel(result), /Acme/);
  });

  it("create-with-name clarification includes space choices", () => {
    const card = createClarificationCard({
      threadId: "t1",
      title: "New project",
      questions: [
        {
          id: "space",
          type: "single_choice",
          label: "Which space should this live in?",
          required: true,
          choices: [
            { id: "build", label: "Build" },
            { id: "research", label: "Explore" },
          ],
        },
      ],
      resumeTool: "project.create",
      resumeArguments: { title: "Hello Dude" },
    });
    assert.equal(card.questions[0]?.choices?.length, 2);
    assert.equal(card.resumeArguments?.title, "Hello Dude");
  });

  it("normalizes explore answers and hides undefined keys in display", () => {
    const normalized = normalizeProjectCreateFromClarification(
      { undefined: "Explore", name: "Hey Dude" },
      {},
    );
    assert.equal(normalized.space, "research");
    assert.equal(normalized.title, "Hey Dude");

    const rows = formatClarificationAnswersForDisplay({
      undefined: "Explore",
    });
    assert.equal(rows[0]?.label, "Space");
    assert.equal(rows[0]?.value, "Explore");

    const sanitized = sanitizeClarificationQuestions([
      {
        id: undefined as unknown as string,
        type: "text",
        label: "Specify project type (build or research) and title.",
        required: true,
      },
    ]);
    assert.equal(sanitized[0]?.type, "single_choice");
    assert.equal(sanitized[0]?.id, "space");

    assert.equal(
      looksLikeBrokenCreateProjectCard({
        title: "New project",
        questions: [
          {
            id: "q0",
            type: "text",
            label: "build or research and title",
          },
        ],
      }),
      true,
    );
  });
});

describe("tools", () => {
  it("validates tool arguments and requires confirmation flag on ui.confirm", () => {
    const create = getAiTool("project.create");
    assert.ok(create?.enabled);
    const bad = validateToolArguments(create!, { title: "Demo" });
    assert.equal(bad.ok, false);

    const good = validateToolArguments(create!, {
      title: "Demo",
      space: "build",
    });
    assert.equal(good.ok, true);

    const confirm = getAiTool("ui.confirm");
    assert.equal(confirm?.permission.requiresConfirmation, true);
  });

  it("parses trailing tool JSON from model output", () => {
    const { text, call } = parseToolCallFromContent(
      'Sure — opening Build.\n{"tool":"nav.open","arguments":{"target":"build"}}',
    );
    assert.match(text, /opening Build/);
    assert.doesNotMatch(text, /"tool"/);
    assert.equal(call?.name, "nav.open");
    assert.equal(call?.arguments?.target, "build");
  });

  it("parses trailing-comma tool JSON", () => {
    const { text, call } = parseToolCallFromContent(
      '{"tool":"project.create","arguments":{"title":"Hello Dude","description":"",}}',
    );
    assert.equal(call?.name, "project.create");
    assert.equal(call?.arguments?.title, "Hello Dude");
    assert.doesNotMatch(text, /"tool"/);
  });

  it("extracts tool from dual blob and strips error junk", () => {
    const { text, call } = parseToolCallFromContent(
      'Hi\n{"tool":"panel.open","arguments":{}} {"error": "Missing required argument: workspace_id"}',
    );
    assert.equal(call?.name, "panel.open");
    assert.doesNotMatch(text, /workspace_id/);
    assert.doesNotMatch(text, /"tool"/);
  });

  it("strips unknown workspace_id and aliases name→title", () => {
    const create = getAiTool("project.create")!;
    const normalized = normalizeToolArguments("project.create", {
      name: "Hello Dude",
      space: "explore",
      workspace_id: "abc",
      description: "note",
    });
    assert.equal(normalized.workspace_id, undefined);
    assert.equal(normalized.title, "Hello Dude");
    assert.equal(normalized.space, "research");
    assert.equal(normalized.summary, "note");
    const validated = validateToolArguments(create, normalized);
    assert.equal(validated.ok, true);
  });

  it("visible strip never leaves tool JSON", () => {
    const stripped = stripToolJsonFromText(
      'Opening.\n{"tool":"nav.open","arguments":{"target":"build"}}',
    );
    assert.doesNotMatch(stripped, /"tool"/);
    assert.match(stripped, /Opening/);
  });
});

describe("intent shortcuts", () => {
  it("maps go to build space to nav.open build", () => {
    const nav = matchNavIntent("go to the build space");
    assert.equal(nav?.target, "build");
  });

  it("maps explore to research", () => {
    const nav = matchNavIntent("take me to explore");
    assert.equal(nav?.target, "research");
  });

  it("parses create project with name", () => {
    const create = matchCreateProjectIntent(
      'create a new project called "Hello Dude"',
    );
    assert.ok(create);
    assert.equal(create.title, "Hello Dude");
  });

  it("parses create project without name", () => {
    const create = matchCreateProjectIntent("create a new project");
    assert.ok(create);
    assert.equal(create.title, null);
  });

  it("opens a named project and understands take me there", () => {
    assert.deepEqual(
      matchOpenProjectIntent("take me to the project 'the one'"),
      { query: "the one" },
    );
    assert.equal(matchTakeMeThereIntent("take me there"), true);
    assert.equal(matchTakeMeThereIntent("open Build"), false);
  });
});

describe("hard sanitize gate", () => {
  it("removes prose, canonical, key-style, and incomplete tool payloads", () => {
    const samples = [
      'Sure.\nui.ask_clarification {"title":"New project","questions":[]}',
      'Ok\n{"tool":"project.create","arguments":{"title":"CRM","space":"build"}}',
      'Here\n{"ui.ask_clarification":{"title":"x","questions":[]}}',
      "Calling tool project.create…\nAlmost done.",
      'Partial {"tool":"nav.open","arguments":{"target":"build"',
    ];
    for (const sample of samples) {
      const cleaned = sanitizeAssistantVisibleText(sample);
      assert.doesNotMatch(cleaned, /"tool"/);
      assert.doesNotMatch(cleaned, /ui\.ask_clarification/);
      assert.doesNotMatch(cleaned, /Calling tool/i);
      assert.doesNotMatch(cleaned, /project\.create/);
    }
  });

  it("parses known key-style clarification without leaking JSON", () => {
    const { text, call } = parseToolCallFromContent(
      'Need a bit more.\n{"ui.ask_clarification":{"title":"New project","questions":[{"id":"space","type":"single_choice","label":"Space"}]}}',
    );
    assert.equal(call?.name, "ui.ask_clarification");
    assert.doesNotMatch(text, /ui\.ask_clarification/);
    assert.doesNotMatch(text, /"questions"/);
  });
});

describe("CRM clarification resume args", () => {
  it("merges CRM title into project.create without requiring model re-emit", () => {
    const normalized = normalizeProjectCreateFromClarification(
      { space: "Build" },
      { title: "CRM" },
    );
    assert.equal(normalized.title, "CRM");
    assert.equal(normalized.space, "build");
    const create = getAiTool("project.create")!;
    const validated = validateToolArguments(create, {
      title: normalized.title,
      space: normalized.space,
    });
    assert.equal(validated.ok, true);
  });
});

describe("per-thread task state", () => {
  it("isolates state by threadId and migrates on project dock", () => {
    clearThreadTaskState("t-a");
    clearThreadTaskState("t-b");
    clearThreadTaskState("t-project");
    upsertThreadTaskState("t-a", {
      goal: "Create CRM",
      step: "awaiting_space",
      facts: { title: "CRM" },
      status: "awaiting_clarification",
    });
    upsertThreadTaskState("t-b", {
      goal: "Other",
      status: "running",
    });
    assert.equal(getThreadTaskState("t-a")?.facts.title, "CRM");
    assert.notEqual(getThreadTaskState("t-b")?.facts.title, "CRM");
    migrateThreadTaskState("t-a", "t-project");
    assert.equal(getThreadTaskState("t-a"), null);
    assert.equal(getThreadTaskState("t-project")?.facts.title, "CRM");
    clearThreadTaskState("t-b");
    clearThreadTaskState("t-project");
  });
});

describe("rolling summary + NO_REGREET", () => {
  it("merges prior summary with newly condensed turns", () => {
    const merged = mergeCondensedSummaries(
      "Goal: create CRM. Pending: pick space.",
      "User chose Build. Created CRM.",
    );
    assert.match(merged, /Goal: create CRM/);
    assert.match(merged, /Created CRM/);
    assert.match(merged, /Prior summary/);
  });

  it("suppresses re-greet when prior turns, assistant, condensed, or task", () => {
    assert.equal(
      shouldSuppressReGreeting({ turns: [{ role: "user", content: "Hi" }] }),
      false,
    );
    assert.equal(
      shouldSuppressReGreeting({
        turns: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
          { role: "user", content: "CRM" },
        ],
      }),
      true,
    );
    assert.equal(
      shouldSuppressReGreeting({
        turns: [{ role: "user", content: "Hi" }],
        condensedActive: true,
      }),
      true,
    );
    assert.equal(
      shouldSuppressReGreeting({
        turns: [{ role: "user", content: "Hi" }],
        taskActive: true,
      }),
      true,
    );
    assert.equal(
      hasPriorConversationTurns([{ role: "user", content: "x" }], {
        taskActive: true,
      }),
      true,
    );
  });
});

describe("tool vs conversation intent gate", () => {
  it("treats chitchat and trivia as conversation-only", () => {
    assert.equal(isConversationOnlyTurn("How's it going?"), true);
    assert.equal(isConversationOnlyTurn("How fast can a horse run"), true);
    assert.equal(isConversationOnlyTurn("What is photosynthesis?"), true);
    assert.equal(isInAppToolIntent("How fast can a horse run"), false);
    assert.equal(isInAppToolIntent("How's it going?"), false);
  });

  it("detects in-app tool intents", () => {
    assert.equal(isInAppToolIntent("create a new project called CRM"), true);
    assert.equal(isInAppToolIntent("go to the build space"), true);
    assert.equal(isInAppToolIntent("search my projects for CRM"), true);
    assert.equal(isConversationOnlyTurn("create a new project"), false);
  });
});

describe("chat layout smoke", () => {
  it("mobile path uses full width and hides scrollbars", () => {
    const src = readFileSync(
      join(rootDir, "components/shell/ChatColumn.tsx"),
      "utf8",
    );
    assert.match(src, /data-mobile-chat/);
    assert.match(src, /min-h-\[30dvh\]/);
    assert.match(src, /scrollbar-width:none/);
    assert.match(src, /chat-scroll/);
    // Mobile branch transcript is full-width
    assert.match(
      src,
      /if \(mobile\)[\s\S]{0,800}?max-w-none/,
    );
    // Composer dock drops 38rem when mobile
    assert.match(src, /mobile \? "max-w-none" : "max-w-\[38rem\]"/);
  });
});
