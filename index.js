/**
 * Fold
 * Compresses AI conversation history into a tiny semantic state (~300 tokens).
 * Zero dependencies. Single file. Bring your own storage and AI.
 *
 * @module fold
 */

// ─── Prompt Templates ────────────────────────────────────────────────────────

const STATE_REWRITE_PROMPT = (currentState, recentTurns) =>
  `Update the conversation summary using the new exchange.

CURRENT SUMMARY:
${currentState || "None yet."}

NEW EXCHANGE:
${recentTurns}

Write a new summary in exactly 3 lines, max 20 words per line:
DECIDED: ...
TOPIC: ...
OPEN: ...

Output only these 3 lines. Nothing else.`;

const FACT_EXTRACTION_PROMPT = (exchange) =>
  `Extract facts from this conversation exchange.
Rules:
- Output format: key:value|key:value
- Keys: nouns only (name, city, budget, product, decision)
- Values: the concrete answer
- Skip questions, greetings, filler
- If no facts: output NONE

Exchange:
${exchange}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses raw fact string "k:v|k:v" into a plain object.
 * Handles values that contain colons (e.g. time:10:30am).
 * @param {string} raw
 * @returns {Record<string, string>}
 */
function parseFacts(raw) {
  if (!raw || typeof raw !== "string") return {};
  if (raw.trim().toUpperCase() === "NONE") return {};
  return Object.fromEntries(
    raw
      .split("|")
      .map((pair) => {
        const i = pair.indexOf(":");
        if (i === -1) return [];
        return [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
      })
      .filter(([k, v]) => k && v)
  );
}

/**
 * Merges new facts into existing facts object (new values win).
 * @param {Record<string, string>} existing
 * @param {Record<string, string>} incoming
 * @returns {Record<string, string>}
 */
function mergeFacts(existing, incoming) {
  return { ...existing, ...incoming };
}

/**
 * Serialises facts object back to "k:v|k:v" string.
 * @param {Record<string, string>} facts
 * @returns {string}
 */
function serialiseFacts(facts) {
  return Object.entries(facts)
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}

// ─── Default empty state ──────────────────────────────────────────────────────

function emptyState() {
  return {
    stateVector: "",
    factWatchlist: {},
    turnCount: 0,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * @param {object} storage
 * @param {Function} compress
 */
function validateOptions(storage, compress) {
  if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
    throw new TypeError(
      "[Fold] storage must be an object with async get(id) and set(id, state) functions."
    );
  }
  if (typeof compress !== "function") {
    throw new TypeError(
      "[Fold] compress must be an async function(prompt) => string. Do NOT pass an AI SDK directly."
    );
  }
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Creates a Fold instance.
 *
 * @param {object} options
 * @param {{ get: (id: string) => Promise<FoldState>, set: (id: string, state: FoldState) => Promise<void> }} options.storage
 * @param {(prompt: string) => Promise<string>} options.compress - Your AI caller. Any provider. No SDK imported here.
 * @returns {{ pack: Function, update: Function, reset: Function }}
 *
 * @example
 * const fold = createFold({
 *   storage: myStorageAdapter,  // { get, set }
 *   compress: async (prompt) => await myAI.call(prompt),  // your function, your SDK
 * });
 */
function createFold({ storage, compress }) {
  validateOptions(storage, compress);

  // Per-conversation queue — serialises updates so turn counts never race.
  /** @type {Map<string, Promise<void>>} */
  const queues = new Map();

  /**
   * Enqueues work for a conversation so updates run serially, never concurrently.
   * @param {string} id
   * @param {() => Promise<void>} fn
   */
  function enqueue(id, fn) {
    const prev = queues.get(id) ?? Promise.resolve();
    const next = prev.then(fn).catch((err) => {
      console.error("[Fold] background update failed:", err);
    });
    queues.set(id, next);
    next.then(() => {
      if (queues.get(id) === next) queues.delete(id);
    });
  }

  /**
   * Loads state and assembles the ~300 token context payload.
   * Pass the returned messages array directly to your AI API.
   *
   * @param {string} conversationId
   * @param {string} newMessage
   * @returns {Promise<{ messages: Array<{ role: string, content: string }> }>}
   */
  async function pack(conversationId, newMessage) {
    const raw = await storage.get(conversationId);
    const state = raw ?? emptyState();

    const { stateVector, factWatchlist } = state;

    const contextParts = [];

    // Layer 1 — State Vector (~200 tokens)
    if (stateVector) {
      contextParts.push(`[Conversation State]\n${stateVector}`);
    }

    // Layer 2 — Fact Watchlist (~50 tokens), always included if present
    const factsStr = serialiseFacts(factWatchlist ?? {});
    if (factsStr) {
      contextParts.push(`[Facts]\n${factsStr}`);
    }

    const systemContent = contextParts.join("\n\n");

    /** @type {Array<{ role: string, content: string }>} */
    const messages = [];

    if (systemContent) {
      messages.push({ role: "system", content: systemContent });
    }

    messages.push({ role: "user", content: newMessage });

    return { messages };
  }

  /**
   * Records a completed turn. Extracts facts and rewrites state every 3 turns.
   * Returns immediately; background work runs in the queue without blocking the caller.
   *
   * @param {string} conversationId
   * @param {string} userMessage
   * @param {string} aiResponse
   * @returns {void}
   */
  function update(conversationId, userMessage, aiResponse) {
    const exchange = `User: ${userMessage}\nAssistant: ${aiResponse}`;

    enqueue(conversationId, async () => {
      const state = (await storage.get(conversationId)) ?? emptyState();
      const nextTurnCount = (state.turnCount ?? 0) + 1;

      // Extract facts from this turn
      const rawFacts = await compress(FACT_EXTRACTION_PROMPT(exchange));
      const newFacts = parseFacts(rawFacts);
      const mergedFacts = mergeFacts(state.factWatchlist ?? {}, newFacts);

      // Rewrite state vector every 3 turns
      let nextStateVector = state.stateVector ?? "";
      if (nextTurnCount % 3 === 0) {
        nextStateVector = await compress(
          STATE_REWRITE_PROMPT(state.stateVector ?? "", exchange)
        );
      }

      await storage.set(conversationId, {
        ...state,
        stateVector: nextStateVector,
        factWatchlist: mergedFacts,
        turnCount: nextTurnCount,
      });
    });
  }

  /**
   * Clears all compressed state for a conversation.
   * Call this when starting a fresh conversation with the same ID.
   *
   * @param {string} conversationId
   * @returns {Promise<void>}
   */
  async function reset(conversationId) {
    await storage.set(conversationId, emptyState());
  }

  return { pack, update, reset };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { createFold };
export default createFold;

/**
 * @typedef {object} FoldState
 * @property {string} stateVector - Rolling summary (~200 tokens)
 * @property {Record<string, string>} factWatchlist - Hard facts as key:value pairs (~50 tokens)
 * @property {number} turnCount - Total turns recorded
 */