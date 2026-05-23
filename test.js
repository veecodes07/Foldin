/**
 * Fold — manual test
 * Run: node test.js
 *
 * Uses an in-memory storage adapter and a fake compress function.
 * No AI API key needed.
 */

import createFold from "./index.js";

// ─── In-memory storage adapter ───────────────────────────────────────────────

const db = new Map();

const storage = {
  get: async (id) => db.get(id) ?? null,
  set: async (id, state) => db.set(id, state),
};

// ─── Fake compress function (simulates your AI caller) ───────────────────────
// In real usage this would be:
// const compress = async (prompt) => await anthropic.messages.create(...)
// But Fold never imports any SDK. You pass your own function.

let compressCallCount = 0;

const compress = async (prompt) => {
  compressCallCount++;
  if (prompt.includes("Extract hard facts")) {
    return "name:Alice|budget:5000|location:Mumbai";
  }
  if (prompt.includes("Rewrite the state")) {
    return "User Alice in Mumbai with budget 5000. Discussing project Fold. Decided: npm-only for now.";
  }
  return "";
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pass(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
  process.exitCode = 1;
}

function section(title) {
  console.log(`\n${title}`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function testInitialPackHasNoSystem() {
  section("1. pack() on fresh conversation");
  const fold = createFold({ storage, compress });
  const { messages } = await fold.pack("conv-fresh", "Hello");

  const hasSystem = messages.some((m) => m.role === "system");
  const userMsg = messages.find((m) => m.role === "user");

  !hasSystem
    ? pass("No system message on first turn (no state yet)")
    : fail("Should have no system message on first turn");

  userMsg?.content === "Hello"
    ? pass("User message is passed through correctly")
    : fail("User message missing or wrong", userMsg?.content);
}

async function testUpdateStoresState() {
  section("2. update() stores turn count");
  const fold = createFold({ storage, compress });
  const id = "conv-update";

  await fold.update(id, "My name is Alice", "Nice to meet you Alice");

  // Give background tasks a moment to finish
  await new Promise((r) => setTimeout(r, 50));

  const state = db.get(id);
  state?.turnCount === 1
    ? pass("Turn count incremented to 1")
    : fail("Turn count wrong", JSON.stringify(state));
}

async function testFactsAppearsInNextPack() {
  section("3. Facts from update() appear in next pack()");
  const fold = createFold({ storage, compress });
  const id = "conv-facts";

  await fold.update(id, "My budget is 5000", "Got it");
  await new Promise((r) => setTimeout(r, 50));

  const { messages } = await fold.pack(id, "What can I afford?");
  const system = messages.find((m) => m.role === "system");

  system?.content.includes("budget:5000")
    ? pass("Fact 'budget:5000' present in system message")
    : fail("Facts missing from system message", system?.content);
}

async function testStateRewriteAt3Turns() {
  section("4. State rewrite triggers at turn 3");
  const fold = createFold({ storage, compress });
  const id = "conv-rewrite";
  const before = compressCallCount;

  fold.update(id, "msg 1", "res 1");
  fold.update(id, "msg 2", "res 2");
  fold.update(id, "msg 3", "res 3"); // turn 3 — rewrite fires
  await new Promise((r) => setTimeout(r, 200));

  const state = db.get(id);
  const rewriteHappened =
    state?.stateVector?.includes("Fold") || compressCallCount > before + 3;

  rewriteHappened
    ? pass("State vector rewritten at turn 3")
    : fail("State rewrite did not fire", state?.stateVector);

  state?.turnCount === 3
    ? pass("Turn count is 3 after 3 updates")
    : fail("Turn count wrong after 3 updates", state?.turnCount);
}

async function testRetrievalIndexNotInjectedWhenIrrelevant() {
  section("5. Retrieval index not injected when irrelevant");

  const localDb = new Map();
  localDb.set("conv-index", {
    stateVector: "Some state",
    factWatchlist: {},
    chunkIndex: ["quantum", "physics"],
    turnCount: 1,
  });

  const localStorage = {
    get: async (id) => localDb.get(id) ?? null,
    set: async (id, state) => localDb.set(id, state),
  };

  const fold = createFold({ storage: localStorage, compress });
  const { messages } = await fold.pack("conv-index", "Tell me about cooking");
  const system = messages.find((m) => m.role === "system");

  !system?.content.includes("[Index]")
    ? pass("Retrieval index NOT injected for irrelevant message")
    : fail("Retrieval index should not appear for unrelated message");
}

async function testRetrievalIndexInjectedWhenRelevant() {
  section("6. Retrieval index injected when relevant");

  const localDb = new Map();
  localDb.set("conv-index-hit", {
    stateVector: "Some state",
    factWatchlist: {},
    chunkIndex: ["quantum", "physics"],
    turnCount: 1,
  });

  const localStorage = {
    get: async (id) => localDb.get(id) ?? null,
    set: async (id, state) => localDb.set(id, state),
  };

  const fold = createFold({ storage: localStorage, compress });
  const { messages } = await fold.pack("conv-index-hit", "Explain quantum entanglement");
  const system = messages.find((m) => m.role === "system");

  system?.content.includes("[Index]")
    ? pass("Retrieval index injected for relevant message")
    : fail("Retrieval index missing for relevant message", system?.content);
}

async function testInvalidStorageThrows() {
  section("7. Validation — bad storage throws");
  try {
    createFold({ storage: {}, compress });
    fail("Should have thrown for invalid storage");
  } catch (e) {
    e.message.includes("[Fold]")
      ? pass("Throws TypeError for invalid storage")
      : fail("Wrong error thrown", e.message);
  }
}

async function testInvalidCompressThrows() {
  section("8. Validation — bad compress throws");
  try {
    createFold({ storage, compress: "not-a-function" });
    fail("Should have thrown for invalid compress");
  } catch (e) {
    e.message.includes("[Fold]")
      ? pass("Throws TypeError for invalid compress")
      : fail("Wrong error thrown", e.message);
  }
}

// ─── Run all ──────────────────────────────────────────────────────────────────

console.log("Running Fold tests...");

(async () => {
  await testInitialPackHasNoSystem();
  await testUpdateStoresState();
  await testFactsAppearsInNextPack();
  await testStateRewriteAt3Turns();
  await testRetrievalIndexNotInjectedWhenIrrelevant();
  await testRetrievalIndexInjectedWhenRelevant();
  await testInvalidStorageThrows();
  await testInvalidCompressThrows();

  console.log(
    process.exitCode === 1
      ? "\n Some tests failed."
      : "\n All tests passed."
  );
})();