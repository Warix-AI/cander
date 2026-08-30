/**
 * Generates ≥100 multi-turn trajectory fixtures (A–Z + adversarial).
 * Run: node --experimental-strip-types scripts/generate-trajectory-fixtures.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "fixtures/trajectories");

type Fix = {
  id: string;
  category: string;
  tags: string[];
  seeded?: boolean;
  turns: unknown[];
};

function writeFix(dir: string, fix: Fix) {
  const d = path.join(root, dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(
    path.join(d, `${fix.id}.json`),
    JSON.stringify(fix, null, 2) + "\n",
  );
}

const fixtures: Array<{ dir: string; fix: Fix }> = [];

function add(dir: string, fix: Fix) {
  fixtures.push({ dir, fix });
}

// ——— A Simple continuation ———
for (let i = 1; i <= 4; i++) {
  const mountains = [
    ["Mount Everest", "8848.86 meters"],
    ["K2", "8611 meters"],
    ["Denali", "6190 meters"],
    ["Mont Blanc", "4808 meters"],
  ][i - 1]!;
  add("A-simple-continuation", {
    id: `A${String(i).padStart(2, "0")}-${mountains[0].toLowerCase().replace(/\s+/g, "-")}-feet`,
    category: "A",
    tags: ["coreference", "follow-up", "unit"],
    turns: [
      { role: "user", content: `How tall is ${mountains[0]}?` },
      {
        role: "assistant",
        content: `${mountains[0]} is ${mountains[1]}.`,
        emit: {
          intent: "height_query",
          entities: [{ label: mountains[0], type: "place" }],
          constraints: { attribute: "height", unit: "meters" },
          topic: { label: `${mountains[0]} height` },
        },
      },
      {
        role: "user",
        content: "What about in feet?",
        expect: {
          activeEntityLabels: [mountains[0]],
          constraints: { attribute: "height", unit: "feet" },
          clarificationRequired: false,
          answerContract: {
            mustAnswerDirectly: true,
            mustNotAskClarification: true,
          },
        },
      },
    ],
  });
}

// ——— B Implicit subject ———
add("B-implicit-subject", {
  id: "B01-tesla-who-when-where",
  category: "B",
  tags: ["coreference", "ellipsis"],
  turns: [
    { role: "user", content: "Tell me about Tesla." },
    {
      role: "assistant",
      content: "Tesla is an EV company...",
      emit: {
        intent: "entity_info",
        entities: [{ label: "Tesla", type: "company" }],
        topic: { label: "Tesla" },
      },
    },
    {
      role: "user",
      content: "Who founded it?",
      expect: {
        activeEntityLabels: ["Tesla"],
        constraints: { attribute: "founder" },
        externalRetrievalRequired: true,
        answerContract: { mustNotAskClarification: true },
      },
    },
    {
      role: "assistant",
      content: "Elon Musk is commonly associated...",
      emit: { constraints: { attribute: "founder" } },
    },
    {
      role: "user",
      content: "When?",
      expect: {
        activeEntityLabels: ["Tesla"],
        constraints: { attribute: "founding_date" },
        answerContract: { mustNotAskClarification: true },
      },
    },
    {
      role: "assistant",
      content: "Tesla was incorporated in 2003.",
      emit: { constraints: { attribute: "founding_date" } },
    },
    {
      role: "user",
      content: "Where?",
      expect: {
        activeEntityLabels: ["Tesla"],
        constraints: { attribute: "location" },
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (const brand of ["Apple", "Nike", "Spotify"]) {
  add("B-implicit-subject", {
    id: `B02-${brand.toLowerCase()}-who`,
    category: "B",
    tags: ["coreference"],
    turns: [
      { role: "user", content: `Tell me about ${brand}.` },
      {
        role: "assistant",
        content: `${brand} is...`,
        emit: {
          intent: "entity_info",
          entities: [{ label: brand, type: "company" }],
        },
      },
      {
        role: "user",
        content: "Who founded it?",
        expect: {
          activeEntityLabels: [brand],
          constraints: { attribute: "founder" },
          answerContract: { mustNotAskClarification: true },
        },
      },
    ],
  });
}

// ——— C Follow-up modifier ———
add("C-follow-up-modifier", {
  id: "C01-mcdonalds-us",
  category: "C",
  tags: ["constraint-replacement", "geography"],
  turns: [
    { role: "user", content: "How many McDonald's locations are there?" },
    {
      role: "assistant",
      content: "Approximately 40,000 worldwide.",
      emit: {
        intent: "location_count",
        entities: [{ label: "McDonald's", type: "company" }],
        constraints: { metric: "locations" },
      },
    },
    {
      role: "user",
      content: "In the US?",
      expect: {
        activeEntityLabels: ["McDonald's"],
        constraints: { geography: "United States" },
        externalRetrievalRequired: true,
        answerContract: { mustAnswerDirectly: true },
      },
    },
  ],
});

for (const [co, geo] of [
  ["Starbucks", "In the US?"],
  ["Walmart", "In the US?"],
  ["Costco", "In the US?"],
] as const) {
  add("C-follow-up-modifier", {
    id: `C02-${co.toLowerCase()}-us`,
    category: "C",
    tags: ["geography"],
    turns: [
      { role: "user", content: `How many ${co} locations are there?` },
      {
        role: "assistant",
        content: "Many worldwide.",
        emit: {
          intent: "location_count",
          entities: [{ label: co, type: "company" }],
        },
      },
      {
        role: "user",
        content: geo,
        expect: {
          constraints: { geography: "United States" },
          externalRetrievalRequired: true,
        },
      },
    ],
  });
}

// ——— D Freshness ———
add("D-freshness", {
  id: "D01-mcdonalds-2026",
  category: "D",
  tags: ["freshness"],
  turns: [
    { role: "user", content: "How many McDonald's locations are there?" },
    {
      role: "assistant",
      content: "Around 39,000 worldwide as of 2023.",
      emit: {
        intent: "location_count",
        entities: [{ label: "McDonald's", type: "company" }],
        constraints: { timeframe: "2023" },
      },
    },
    {
      role: "user",
      content: "In 2026.",
      expect: {
        freshnessRequirement: true,
        externalRetrievalRequired: true,
        constraints: { timeframe: "2026" },
        answerContract: {
          mustUseFreshEvidence: true,
          mustNotRepeatPreviousAnswer: true,
        },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("D-freshness", {
    id: `D0${i}-fresh-now`,
    category: "D",
    tags: ["freshness"],
    turns: [
      { role: "user", content: "What's the population of Utah?" },
      {
        role: "assistant",
        content: "About 3.4 million as of 2022.",
        emit: {
          intent: "population_query",
          entities: [{ label: "Utah", type: "place" }],
          constraints: { attribute: "population", timeframe: "2022" },
        },
      },
      {
        role: "user",
        content: i === 2 ? "Now?" : i === 3 ? "Currently?" : "Latest?",
        expect: {
          freshnessRequirement: true,
          externalRetrievalRequired: true,
          answerContract: { mustUseFreshEvidence: true },
        },
      },
    ],
  });
}

// ——— E Dissatisfied ———
add("E-dissatisfied", {
  id: "E01-crm-plumbing",
  category: "E",
  tags: ["dissatisfaction", "constraint-replacement"],
  turns: [
    { role: "user", content: "What are the best CRM tools?" },
    {
      role: "assistant",
      content: "Salesforce, HubSpot...",
      emit: { intent: "crm_recommend" },
    },
    {
      role: "user",
      content: "No, for a tiny plumbing company.",
      expect: {
        constraints: { businessSize: "tiny", industry: "plumbing" },
        dissatisfactionSignal: true,
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (const x of ["E02", "E03", "E04"]) {
  add("E-dissatisfied", {
    id: `${x}-retry-shape`,
    category: "E",
    tags: ["dissatisfaction"],
    turns: [
      { role: "user", content: "Recommend a CRM." },
      {
        role: "assistant",
        content: "Salesforce...",
        emit: { intent: "crm_recommend" },
      },
      {
        role: "user",
        content: "No, for a tiny plumbing company.",
        expect: { dissatisfactionSignal: true },
      },
    ],
  });
}

// ——— F Try again ———
add("F-try-again", {
  id: "F01-calories-retry",
  category: "F",
  tags: ["dissatisfaction", "freshness"],
  turns: [
    { role: "user", content: "Find the calories in a Big Mac." },
    {
      role: "assistant",
      content: "I'm not sure, maybe around 500?",
      emit: {
        intent: "calorie_query",
        entities: [{ label: "Big Mac", type: "food" }],
      },
    },
    {
      role: "user",
      content: "Try again.",
      expect: {
        dissatisfactionSignal: true,
        freshnessRequirement: true,
        externalRetrievalRequired: true,
        answerContract: { mustNotRepeatPreviousAnswer: true },
      },
    },
  ],
});

for (const phr of ["Retry", "Again", "That's not what I asked"]) {
  add("F-try-again", {
    id: `F02-${phr.toLowerCase().replace(/\s+/g, "-")}`,
    category: "F",
    tags: ["dissatisfaction"],
    turns: [
      { role: "user", content: "Calories in a Whopper?" },
      {
        role: "assistant",
        content: "Uncertain.",
        emit: { intent: "calorie_query" },
      },
      {
        role: "user",
        content: phr,
        expect: {
          dissatisfactionSignal: true,
          externalRetrievalRequired: true,
        },
      },
    ],
  });
}

// ——— G Expand ———
add("G-expand", {
  id: "G01-longer",
  category: "G",
  tags: ["response-shape"],
  turns: [
    { role: "user", content: "Summarize example.com" },
    {
      role: "assistant",
      content: "Short summary.",
      emit: {
        intent: "summarize",
        evidence: [
          { url: "https://example.com", title: "Example", sourceType: "web" },
        ],
      },
    },
    {
      role: "user",
      content: "Longer.",
      expect: {
        desiredAnswerShape: "detailed",
        clarificationRequired: false,
        answerContract: { mustAnswerDirectly: true },
      },
    },
  ],
});

for (const w of ["More detail", "Expand", "In detail"]) {
  add("G-expand", {
    id: `G02-${w.toLowerCase().replace(/\s+/g, "-")}`,
    category: "G",
    tags: ["response-shape"],
    turns: [
      { role: "user", content: "Summarize the page." },
      {
        role: "assistant",
        content: "Brief.",
        emit: { intent: "summarize" },
      },
      {
        role: "user",
        content: w,
        expect: { desiredAnswerShape: "detailed" },
      },
    ],
  });
}

// ——— H Structure ———
add("H-structure", {
  id: "H01-main-points",
  category: "H",
  tags: ["response-shape"],
  turns: [
    { role: "user", content: "Explain this article." },
    {
      role: "assistant",
      content: "Long explanation...",
      emit: { intent: "explain" },
    },
    {
      role: "user",
      content: "Just give me the main points.",
      expect: {
        desiredAnswerShape: "key_points",
        answerContract: { mustAnswerDirectly: true },
      },
    },
  ],
});

for (const w of ["Key points", "Briefly", "Shorter"]) {
  add("H-structure", {
    id: `H02-${w.toLowerCase().replace(/\s+/g, "-")}`,
    category: "H",
    tags: ["response-shape"],
    turns: [
      { role: "user", content: "Explain OAuth." },
      {
        role: "assistant",
        content: "Detailed...",
        emit: { intent: "explain" },
      },
      {
        role: "user",
        content: w,
        expect: {
          desiredAnswerShape: w === "Key points" ? "key_points" : "brief",
        },
      },
    ],
  });
}

// ——— I Earlier item ———
add("I-refer-earlier", {
  id: "I01-second-laptop",
  category: "I",
  tags: ["coreference", "ordinal"],
  turns: [
    { role: "user", content: "Give me three laptops." },
    {
      role: "assistant",
      content: "A) MacBook  B) XPS  C) ThinkPad",
      emit: {
        intent: "list_laptops",
        resultSet: {
          resultSetId: "laptops1",
          items: [
            { label: "MacBook", ordinal: 1, itemId: "lap_a" },
            { label: "XPS", ordinal: 2, itemId: "lap_b" },
            { label: "ThinkPad", ordinal: 3, itemId: "lap_c" },
          ],
        },
      },
    },
    {
      role: "user",
      content: "Tell me more about the second one.",
      expect: {
        referencedItemLabel: "XPS",
        activeEntityLabels: ["XPS"],
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (const [ord, label] of [
  ["first", "Alpha"],
  ["third", "Gamma"],
  ["#2", "Beta"],
] as const) {
  add("I-refer-earlier", {
    id: `I02-${ord.replace("#", "n")}`,
    category: "I",
    tags: ["ordinal"],
    turns: [
      { role: "user", content: "List three options." },
      {
        role: "assistant",
        content: "1 Alpha 2 Beta 3 Gamma",
        emit: {
          resultSet: {
            items: [
              { label: "Alpha", ordinal: 1 },
              { label: "Beta", ordinal: 2 },
              { label: "Gamma", ordinal: 3 },
            ],
          },
        },
      },
      {
        role: "user",
        content: `The ${ord} one.`,
        expect: { referencedItemLabel: label },
      },
    ],
  });
}

// ——— J Correction ———
add("J-correction", {
  id: "J01-apple-fruit",
  category: "J",
  tags: ["correction"],
  turns: [
    { role: "user", content: "Tell me about Apple." },
    {
      role: "assistant",
      content: "Apple Inc. makes iPhones...",
      emit: {
        intent: "entity_info",
        entities: [{ label: "Apple", type: "company", id: "apple_inc" }],
      },
    },
    {
      role: "user",
      content: "No, the fruit.",
      expect: {
        activeEntityLabels: ["apple (fruit)"],
        answerContract: { mustAnswerDirectly: true },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("J-correction", {
    id: `J0${i}-fruit-again`,
    category: "J",
    tags: ["correction"],
    turns: [
      { role: "user", content: "Tell me about Apple." },
      {
        role: "assistant",
        content: "Apple Inc...",
        emit: {
          entities: [{ label: "Apple", type: "company" }],
        },
      },
      {
        role: "user",
        content: "No, the fruit.",
        expect: { activeEntityLabels: ["apple (fruit)"] },
      },
    ],
  });
}

// ——— K Partial correction ———
add("K-partial-correction", {
  id: "K01-italian-provo",
  category: "K",
  tags: ["constraint-replacement"],
  turns: [
    {
      role: "user",
      content: "Find Italian restaurants in Salt Lake City.",
    },
    {
      role: "assistant",
      content: "Here are some in SLC...",
      emit: {
        intent: "find_restaurants",
        constraints: { cuisine: "Italian", location: "Salt Lake City" },
      },
    },
    {
      role: "user",
      content: "Actually Provo.",
      expect: {
        constraints: { location: "Provo" },
        externalRetrievalRequired: true,
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("K-partial-correction", {
    id: `K0${i}-provo`,
    category: "K",
    tags: ["constraint-replacement"],
    turns: [
      { role: "user", content: "Find sushi in Salt Lake City." },
      {
        role: "assistant",
        content: "...",
        emit: {
          intent: "find_restaurants",
          constraints: { location: "Salt Lake City" },
        },
      },
      {
        role: "user",
        content: "Actually Provo.",
        expect: { constraints: { location: "Provo" } },
      },
    ],
  });
}

// ——— L/M Internal ———
add("L-internal-cander", {
  id: "L01-projects",
  category: "L",
  tags: ["internal"],
  turns: [
    {
      role: "user",
      content: "What projects do I have in Build?",
      expect: {
        internalDataRequired: true,
        externalRetrievalRequired: false,
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

add("M-internal-follow-up", {
  id: "M01-recent-edit",
  category: "M",
  tags: ["internal"],
  turns: [
    { role: "user", content: "What projects do I have in Build?" },
    {
      role: "assistant",
      content: "A B C",
      emit: {
        intent: "list_projects",
        resultSet: {
          items: [
            { label: "Project A", ordinal: 1 },
            { label: "Project B", ordinal: 2 },
            { label: "Project C", ordinal: 3 },
          ],
        },
      },
    },
    {
      role: "user",
      content: "Which one did I edit most recently?",
      expect: {
        internalDataRequired: true,
        externalRetrievalRequired: false,
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("L-internal-cander", {
    id: `L0${i}-projects`,
    category: "L",
    tags: ["internal"],
    turns: [
      {
        role: "user",
        content: "What projects do I have?",
        expect: { internalDataRequired: true },
      },
    ],
  });
}

// ——— N Mix ———
add("N-internal-external-mix", {
  id: "N01-hvac-seo",
  category: "N",
  tags: ["internal", "external"],
  turns: [
    { role: "user", content: "Open my HVAC website project." },
    {
      role: "assistant",
      content: "Opened HVAC site project.",
      emit: {
        intent: "open_project",
        entities: [{ label: "HVAC website", type: "project" }],
      },
    },
    {
      role: "user",
      content: "How does its SEO compare with competitors?",
      expect: {
        activeEntityLabels: ["HVAC website"],
        // may need semantic — at least not clarify wrongly
      },
    },
  ],
});

for (let i = 2; i <= 3; i++) {
  add("N-internal-external-mix", {
    id: `N0${i}-seo`,
    category: "N",
    tags: ["mixed"],
    turns: [
      { role: "user", content: "Open my HVAC website project." },
      {
        role: "assistant",
        content: "Opened.",
        emit: {
          entities: [{ label: "HVAC website", type: "project" }],
        },
      },
      {
        role: "user",
        content: "How does its SEO compare with competitors?",
        expect: { activeEntityLabels: ["HVAC website"] },
      },
    ],
  });
}

// ——— O Browser not memory ———
add("O-browser-not-memory", {
  id: "O01-closed-panel-pricing",
  category: "O",
  tags: ["evidence-reuse"],
  turns: [
    { role: "user", content: "Open example.com" },
    {
      role: "assistant",
      content: "Opened and summarized.",
      emit: {
        intent: "browse",
        evidence: [
          {
            evidenceId: "ev_ex",
            url: "https://example.com",
            title: "Example pricing",
            sourceType: "web",
          },
        ],
      },
    },
    {
      role: "user",
      content: "What did you say earlier about pricing?",
      expect: {
        answerContract: { mustAnswerDirectly: true },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("O-browser-not-memory", {
    id: `O0${i}-pricing-recall`,
    category: "O",
    tags: ["evidence-reuse"],
    turns: [
      { role: "user", content: "Read https://example.com/pricing" },
      {
        role: "assistant",
        content: "Pricing starts at $10.",
        emit: {
          evidence: [
            {
              url: "https://example.com/pricing",
              title: "Pricing",
              sourceType: "web",
            },
          ],
        },
      },
      {
        role: "user",
        content: "What did you say earlier about pricing?",
        expect: { answerContract: { mustAnswerDirectly: true } },
      },
    ],
  });
}

// ——— P Midstream task change ———
add("P-task-change", {
  id: "P01-landing-to-dashboard",
  category: "P",
  tags: ["topic-reset"],
  turns: [
    { role: "user", content: "Help me build a landing page." },
    {
      role: "assistant",
      content: "What product?",
      emit: {
        intent: "build_landing_page",
        topic: { id: "topic_landing", label: "landing page" },
      },
    },
    {
      role: "user",
      content: "Actually make it an internal dashboard instead.",
      expect: {
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (let i = 2; i <= 3; i++) {
  add("P-task-change", {
    id: `P0${i}-dashboard`,
    category: "P",
    tags: ["topic-reset"],
    turns: [
      { role: "user", content: "Help me build a landing page." },
      {
        role: "assistant",
        content: "Sure.",
        emit: {
          intent: "build_landing_page",
          topic: { label: "landing page" },
        },
      },
      {
        role: "user",
        content: "Actually make it an internal dashboard instead.",
        expect: {},
      },
    ],
  });
}

// ——— Q Ambiguous resolvable ———
add("Q-ambiguous-resolvable", {
  id: "Q01-cheaper-phone",
  category: "Q",
  tags: ["coreference"],
  turns: [
    { role: "user", content: "Compare iPhone and Pixel." },
    {
      role: "assistant",
      content: "Comparison...",
      emit: {
        intent: "compare",
        entities: [
          { label: "iPhone", type: "product" },
          { label: "Pixel", type: "product" },
        ],
        resultSet: {
          items: [
            { label: "iPhone", ordinal: 1 },
            { label: "Pixel", ordinal: 2 },
          ],
        },
      },
    },
    {
      role: "user",
      content: "Which is cheaper?",
      expect: {
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("Q-ambiguous-resolvable", {
    id: `Q0${i}-cheaper`,
    category: "Q",
    tags: ["coreference"],
    turns: [
      { role: "user", content: "Compare iPhone and Pixel." },
      {
        role: "assistant",
        content: "...",
        emit: {
          entities: [
            { label: "iPhone", type: "product" },
            { label: "Pixel", type: "product" },
          ],
        },
      },
      {
        role: "user",
        content: "Which is cheaper?",
        expect: { answerContract: { mustNotAskClarification: true } },
      },
    ],
  });
}

// ——— R Ambiguous unresolvable ———
add("R-ambiguous-unresolvable", {
  id: "R01-send-it-to-him",
  category: "R",
  tags: ["clarification", "adversarial"],
  turns: [
    {
      role: "user",
      content: "Send it to him.",
      candidates: {
        entities: [
          { id: "doc1", type: "file", label: "Report.pdf", contextClass: "ACTIVE" },
          { id: "doc2", type: "file", label: "Invoice.pdf", contextClass: "AVAILABLE" },
          { id: "p1", type: "person", label: "Matt", contextClass: "ACTIVE" },
          { id: "p2", type: "person", label: "Jon", contextClass: "AVAILABLE" },
        ],
      },
      expect: {
        clarificationRequired: true,
        answerContract: { mustNotAskClarification: false },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("R-ambiguous-unresolvable", {
    id: `R0${i}-it-ambiguous`,
    category: "R",
    tags: ["clarification", "adversarial"],
    turns: [
      {
        role: "user",
        content: "Forward it.",
        candidates: {
          entities: [
            { id: "a", type: "file", label: "A", contextClass: "ACTIVE" },
            { id: "b", type: "file", label: "B", contextClass: "ACTIVE" },
          ],
        },
        expect: { clarificationRequired: true },
      },
    ],
  });
}

// ——— S Tool autonomy ———
add("S-tool-autonomy", {
  id: "S01-canderhq",
  category: "S",
  tags: ["tool-autonomy"],
  turns: [
    {
      role: "user",
      content: "What does CanderHQ do?",
      expect: {
        // live info / org → may prerun via compile liveInfo or external
        answerContract: { mustAnswerDirectly: true, mustNotAskClarification: true },
      },
    },
  ],
});

for (const q of [
  "What does OpenAI do?",
  "What does Stripe do?",
  "What does Vercel do?",
]) {
  add("S-tool-autonomy", {
    id: `S02-${q.split(" ")[2]!.toLowerCase()}`,
    category: "S",
    tags: ["tool-autonomy"],
    turns: [
      {
        role: "user",
        content: q,
        expect: {
          answerContract: { mustNotAskClarification: true },
        },
      },
    ],
  });
}

// ——— T Source reuse ———
add("T-source-reuse", {
  id: "T01-reuters",
  category: "T",
  tags: ["evidence-reuse"],
  turns: [
    { role: "user", content: "Research Acme Corp." },
    {
      role: "assistant",
      content: "Found sources including Reuters...",
      emit: {
        intent: "research",
        evidence: [
          {
            evidenceId: "reut1",
            url: "https://reuters.com/acme",
            title: "Reuters: Acme",
            sourceType: "news",
          },
          {
            evidenceId: "bbc1",
            url: "https://bbc.com/acme",
            title: "BBC",
            sourceType: "news",
          },
        ],
      },
    },
    {
      role: "user",
      content: "What did the Reuters source say?",
      expect: {
        answerContract: { mustAnswerDirectly: true },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("T-source-reuse", {
    id: `T0${i}-reuters`,
    category: "T",
    tags: ["evidence-reuse"],
    turns: [
      { role: "user", content: "Research Acme." },
      {
        role: "assistant",
        content: "...",
        emit: {
          evidence: [
            {
              evidenceId: "reut1",
              url: "https://reuters.com/acme",
              title: "Reuters",
              sourceType: "news",
            },
          ],
        },
      },
      {
        role: "user",
        content: "What did the Reuters source say?",
        expect: { answerContract: { mustAnswerDirectly: true } },
      },
    ],
  });
}

// ——— U Constraint accumulation ———
add("U-constraint-accumulate", {
  id: "U01-laptop-stack",
  category: "U",
  tags: ["constraint-inheritance"],
  turns: [
    { role: "user", content: "Find me a laptop." },
    {
      role: "assistant",
      content: "What matters?",
      emit: { intent: "find_laptop" },
    },
    {
      role: "user",
      content: "Under $1500.",
      expect: { constraints: { maxPrice: "1500" } },
    },
    {
      role: "assistant",
      content: "OK.",
      emit: {},
    },
    {
      role: "user",
      content: "Mac.",
      expect: { constraints: { maxPrice: "1500", platform: "Mac" } },
    },
    {
      role: "assistant",
      content: "OK.",
      emit: {},
    },
    {
      role: "user",
      content: "14 inch.",
      expect: {
        constraints: {
          maxPrice: "1500",
          platform: "Mac",
          screenSize: "14 inch",
        },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("U-constraint-accumulate", {
    id: `U0${i}-price-mac`,
    category: "U",
    tags: ["constraint-inheritance"],
    turns: [
      { role: "user", content: "Find me a laptop." },
      {
        role: "assistant",
        content: "Sure.",
        emit: { intent: "find_laptop" },
      },
      {
        role: "user",
        content: "Under $1200.",
        expect: { constraints: { maxPrice: "1200" } },
      },
      { role: "assistant", content: "OK.", emit: {} },
      {
        role: "user",
        content: "Mac.",
        expect: { constraints: { platform: "Mac" } },
      },
    ],
  });
}

// ——— V Ellipsis ———
add("V-ellipsis", {
  id: "V01-bigmac-fries",
  category: "V",
  tags: ["follow-up"],
  turns: [
    { role: "user", content: "How many calories are in a Big Mac?" },
    {
      role: "assistant",
      content: "About 590.",
      emit: {
        intent: "calorie_query",
        entities: [{ label: "Big Mac", type: "food" }],
      },
    },
    {
      role: "user",
      content: "And fries?",
      expect: {
        constraints: { addItem: "fries" },
        externalRetrievalRequired: true,
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (const item of ["shake", "nuggets", "apple pie"]) {
  add("V-ellipsis", {
    id: `V02-and-${item.replace(/\s+/g, "-")}`,
    category: "V",
    tags: ["follow-up"],
    turns: [
      { role: "user", content: "Calories in a Big Mac?" },
      {
        role: "assistant",
        content: "590.",
        emit: {
          intent: "calorie_query",
          entities: [{ label: "Big Mac", type: "food" }],
        },
      },
      {
        role: "user",
        content: `And ${item}?`,
        expect: { constraints: { addItem: item } },
      },
    ],
  });
}

// ——— W What about ———
add("W-what-about", {
  id: "W01-utah-colorado",
  category: "W",
  tags: ["follow-up", "entity-swap"],
  turns: [
    { role: "user", content: "What's the population of Utah?" },
    {
      role: "assistant",
      content: "About 3.4M.",
      emit: {
        intent: "population_query",
        entities: [{ label: "Utah", type: "place" }],
        constraints: { attribute: "population" },
      },
    },
    {
      role: "user",
      content: "What about Colorado?",
      expect: {
        activeEntityLabels: ["Colorado"],
        constraints: { attribute: "population" },
        externalRetrievalRequired: true,
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (const place of ["Nevada", "Arizona", "Idaho"]) {
  add("W-what-about", {
    id: `W02-${place.toLowerCase()}`,
    category: "W",
    tags: ["entity-swap"],
    turns: [
      { role: "user", content: "Population of Utah?" },
      {
        role: "assistant",
        content: "...",
        emit: {
          entities: [{ label: "Utah", type: "place" }],
          constraints: { attribute: "population" },
        },
      },
      {
        role: "user",
        content: `What about ${place}?`,
        expect: { activeEntityLabels: [place] },
      },
    ],
  });
}

// ——— X Time follow-up (mostly semantic/medium — light asserts) ———
add("X-time-follow-up", {
  id: "X01-how-long",
  category: "X",
  tags: ["follow-up"],
  turns: [
    { role: "user", content: "When does the game start?" },
    {
      role: "assistant",
      content: "7 PM.",
      emit: {
        intent: "event_time",
        constraints: { eventTime: "7 PM" },
        entities: [{ label: "the game", type: "event" }],
      },
    },
    {
      role: "user",
      content: "How long until then?",
      expect: {
        answerContract: { mustNotAskClarification: true },
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("X-time-follow-up", {
    id: `X0${i}-until`,
    category: "X",
    tags: ["follow-up"],
    turns: [
      { role: "user", content: "When does the game start?" },
      {
        role: "assistant",
        content: "7 PM.",
        emit: {
          constraints: { eventTime: "7 PM" },
          entities: [{ label: "the game", type: "event" }],
        },
      },
      {
        role: "user",
        content: "How long until then?",
        expect: { answerContract: { mustNotAskClarification: true } },
      },
    ],
  });
}

// ——— Y Negative constraint ———
add("Y-negative-constraint", {
  id: "Y01-no-salesforce",
  category: "Y",
  tags: ["exclusions"],
  turns: [
    { role: "user", content: "Find me a CRM for my company." },
    {
      role: "assistant",
      content: "Salesforce, HubSpot...",
      emit: { intent: "crm_recommend" },
    },
    {
      role: "user",
      content: "Nothing from Salesforce.",
      expect: {
        exclusions: ["Salesforce"],
        dissatisfactionSignal: true,
      },
    },
  ],
});

for (let i = 2; i <= 4; i++) {
  add("Y-negative-constraint", {
    id: `Y0${i}-exclude-sf`,
    category: "Y",
    tags: ["exclusions"],
    turns: [
      { role: "user", content: "Find a CRM." },
      {
        role: "assistant",
        content: "...",
        emit: { intent: "crm_recommend" },
      },
      {
        role: "user",
        content: "Nothing from Salesforce.",
        expect: { exclusions: ["Salesforce"] },
      },
    ],
  });
}

// ——— Z Style ———
add("Z-response-style", {
  id: "Z01-simpler-eli5",
  category: "Z",
  tags: ["response-shape"],
  turns: [
    { role: "user", content: "Explain OAuth." },
    {
      role: "assistant",
      content: "Detailed OAuth explanation...",
      emit: { intent: "explain" },
    },
    {
      role: "user",
      content: "Simpler.",
      expect: { desiredAnswerShape: "brief" },
    },
    {
      role: "assistant",
      content: "Simpler version...",
      emit: {},
    },
    {
      role: "user",
      content: "Like I'm five.",
      expect: {
        desiredAnswerShape: "brief",
        answerContract: { mustAnswerDirectly: true },
      },
    },
  ],
});

for (const w of ["Simpler", "TLDR", "Briefly"]) {
  add("Z-response-style", {
    id: `Z02-${w.toLowerCase()}`,
    category: "Z",
    tags: ["response-shape"],
    turns: [
      { role: "user", content: "Explain TLS." },
      {
        role: "assistant",
        content: "Long...",
        emit: { intent: "explain" },
      },
      {
        role: "user",
        content: w,
        expect: { desiredAnswerShape: "brief" },
      },
    ],
  });
}

// ——— Adversarial ———
add("adversarial", {
  id: "ADV01-not-that-one-before",
  category: "ADV",
  tags: ["adversarial", "ordinal"],
  turns: [
    { role: "user", content: "Give three options." },
    {
      role: "assistant",
      content: "1 Red 2 Blue 3 Green",
      emit: {
        resultSet: {
          items: [
            { label: "Red", ordinal: 1 },
            { label: "Blue", ordinal: 2 },
            { label: "Green", ordinal: 3 },
          ],
        },
      },
    },
    {
      role: "user",
      content: "No not that one, the one before it.",
      expect: {},
    },
  ],
});

add("adversarial", {
  id: "ADV02-forget-all",
  category: "ADV",
  tags: ["adversarial"],
  turns: [
    { role: "user", content: "Find Italian in SLC." },
    {
      role: "assistant",
      content: "...",
      emit: {
        intent: "find_restaurants",
        constraints: { cuisine: "Italian" },
        entities: [{ label: "search", type: "task" }],
      },
    },
    {
      role: "user",
      content: "Actually forget all that.",
      expect: {},
    },
  ],
});

add("adversarial", {
  id: "ADV03-same-cheaper",
  category: "ADV",
  tags: ["adversarial"],
  turns: [
    { role: "user", content: "Find me a laptop." },
    {
      role: "assistant",
      content: "MacBook Pro...",
      emit: { intent: "find_laptop" },
    },
    {
      role: "user",
      content: "Same thing but cheaper.",
      expect: {
        constraints: { cheaper: "true" },
        externalRetrievalRequired: true,
      },
    },
  ],
});

add("adversarial", {
  id: "ADV04-topic-a-b-a",
  category: "ADV",
  tags: ["adversarial", "topic-reset"],
  turns: [
    { role: "user", content: "Tell me about laptops." },
    {
      role: "assistant",
      content: "...",
      emit: {
        topic: { id: "topic_laptop", label: "laptops" },
        entities: [{ label: "laptop", type: "product", id: "ent_laptop" }],
      },
    },
    { role: "user", content: "Actually, what's the weather in Austin?" },
    {
      role: "assistant",
      content: "Sunny.",
      emit: {
        topic: { id: "topic_weather", label: "weather" },
        entities: [{ label: "Austin", type: "place" }],
      },
    },
    {
      role: "user",
      content: "Go back to the laptop we discussed earlier.",
      expect: {},
    },
  ],
});

add("adversarial", {
  id: "ADV05-dual-it",
  category: "ADV",
  tags: ["adversarial", "clarification"],
  turns: [
    {
      role: "user",
      content: "Open it.",
      candidates: {
        entities: [
          {
            id: "p1",
            type: "project",
            label: "Acme",
            contextClass: "ACTIVE",
          },
          {
            id: "c1",
            type: "company",
            label: "Acme",
            contextClass: "AVAILABLE",
          },
        ],
      },
      expect: { clarificationRequired: true },
    },
  ],
});

add("adversarial", {
  id: "ADV06-stale-vs-fresh",
  category: "ADV",
  tags: ["adversarial", "freshness"],
  turns: [
    { role: "user", content: "McDonald's location count?" },
    {
      role: "assistant",
      content: "39k in 2023.",
      emit: {
        intent: "location_count",
        constraints: { timeframe: "2023" },
        evidence: [
          {
            evidenceId: "old",
            title: "2023 report",
            sourceType: "web",
          },
        ],
      },
    },
    {
      role: "user",
      content: "In 2026.",
      expect: {
        freshnessRequirement: true,
        answerContract: { mustUseFreshEvidence: true },
      },
    },
  ],
});

add("adversarial", {
  id: "ADV07-same-name-project-company",
  category: "ADV",
  tags: ["adversarial", "clarification"],
  turns: [
    {
      role: "user",
      content: "Tell me about Acme SEO competitors.",
      candidates: {
        entities: [
          {
            id: "proj",
            type: "project",
            label: "Acme",
            contextClass: "ACTIVE",
          },
          {
            id: "co",
            type: "company",
            label: "Acme",
            contextClass: "AVAILABLE",
          },
        ],
      },
      expect: { clarificationRequired: true },
    },
  ],
});

// Write all
if (fs.existsSync(root)) {
  // keep types.ts / catalog — remove generated json only under category dirs
}
for (const { dir, fix } of fixtures) {
  writeFix(dir, fix);
}

console.log(`Wrote ${fixtures.length} trajectory fixtures to ${root}`);
