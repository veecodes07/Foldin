/**
 * Fold
 * Compresses AI conversation history into a tiny semantic state (~300 tokens).
 * Zero dependencies. Single file. Bring your own storage and AI.
 *
 * @module fold
 */

// ─── Prompt Templates ────────────────────────────────────────────────────────

const STATE_REWRITE_PROMPT = (currentState, recentTurns) =>
  `You are a conversation state manager.
Current state: ${currentState}
Recent turns: ${recentTurns}
Rewrite the state in under 200 tokens. Include:
- What has been decided or agreed
- Current active topic
- Key user facts (age, location, budget, constraints)
- Open threads to follow up
Be dense. Drop nothing important. Add nothing unnecessary.
Return only the rewritten state, no explanation.`;

const FACT_EXTRACTION_PROMPT = (exchange) =>
  `Extract hard facts from this exchange as key:value pairs under 50 tokens.
Only facts: names, numbers, locations, decisions, constraints.
Exchange: ${exchange}
Return only key:value pairs separated by |. Nothing else.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses raw fact string "k:v|k:v" into a plain object.
 * @param {string} raw
 * @returns {Record<string, string>}
 */
function parseFacts(raw) {
  if (!raw || typeof raw !== "string") return {};
  return Object.fromEntries(
    raw
      .split("|")
      .map((pair) => pair.split(":").map((s) => s.trim()))
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

/**
 * Checks whether a keyword from the retrieval index appears in the new message.
 * @param {string[]} keywords
 * @param {string} message
 * @returns {boolean}
 */
function isRetrievalRelevant(keywords, message) {
  if (!keywords || keywords.length === 0) return false;
  const lower = message.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ─── Default empty state ──────────────────────────────────────────────────────

function emptyState() {
  return {
    stateVector: "",
    factWatchlist: {},
    chunkIndex: [],
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
 * @returns {{ pack: Function, update: Function }}
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
  // Each conversation processes one update at a time, in arrival order.
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
    // Clean up resolved chains to avoid memory leak on long-running processes
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

    const { stateVector, factWatchlist, chunkIndex } = state;

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

    // Layer 3 — Retrieval Index (0-200 tokens), only injected when relevant
    if (isRetrievalRelevant(chunkIndex, newMessage)) {
      contextParts.push(`[Index]\n${chunkIndex.join(", ")}`);
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
   * Enqueued per conversation — updates are serialised so turn counts are always correct.
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

  return { pack, update };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { createFold };
export default createFold;

/**
 * @typedef {object} FoldState
 * @property {string} stateVector - Rolling summary (~200 tokens)
 * @property {Record<string, string>} factWatchlist - Hard facts as key:value pairs (~50 tokens)
 * @property {string[]} chunkIndex - Sparse keyword index (0-200 tokens)
 * @property {number} turnCount - Total turns recorded
 */