# Foldin

> Zero dependency conversation compression for LLMs. ~150 lines. Bring your own AI and storage.

Every token you send to an LLM costs money. Most of it is conversation history the model barely needs. Fold compresses that history into a ~300 token semantic state and injects only what's relevant — so you pay for meaning, not repetition.

No opinions. No SDKs imported. No database forced on you. It does one thing.

---

## Why
In a 30-turn conversation, Fold reduced token usage from **10,242 to 3,000 — a 71% saving.**
Savings grow the longer the conversation runs.

---

## How it works

Fold maintains three layers of compressed state per conversation:

| Layer | Size | What it is |
|---|---|---|
| State Vector | ~200 tokens | Rolling summary, rewritten every 3 turns |
| Fact Watchlist | ~50 tokens | Hard facts as `key:value` pairs, never lost |
| Retrieval Index | 0–200 tokens | Keyword index, only injected when relevant |

In a 30-turn conversation, Fold reduced token usage from **10,242 to 3,000 — a 71% saving.**
Savings grow the longer the conversation runs.

`pack()` assembles these into a `messages` array you pass straight to your AI API.  
`update()` records the turn, extracts facts, and rewrites state every 3 turns — all in the background, never blocking your response.

---

## Install

```bash
npm install @vedsu/foldin
```

---

## Usage

```js
import createFold from '@yourname/fold';

const fold = createFold({
  // Bring your own storage — anything with get/set
  storage: {
    get: async (id) => await db.get(id),
    set: async (id, state) => await db.set(id, state),
  },

  // Bring your own AI — any provider, any SDK
  compress: async (prompt) => {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content[0].text;
  },
});

// Pack context before each AI call
const { messages } = await fold.pack(conversationId, userMessage);
const response = await yourAI.call(messages);

// Update state after — non-blocking
fold.update(conversationId, userMessage, response);
```

---

## Storage adapter

Any object with `get` and `set` works. In-memory, Redis, Postgres, SQLite — your call.

```js
// Minimal interface
{
  get: async (conversationId) => ({ stateVector, factWatchlist, chunkIndex, turnCount }),
  set: async (conversationId, state) => void
}
```

---

## Principles

- **Zero dependencies.** Node.js built-ins only.
- **Single file.** `index.js`, under 200 lines.
- **Bring your own storage.** No database opinions.
- **Bring your own AI.** No SDK imports. Pass a function.
- **Provider agnostic.** Claude, GPT-4, Gemini, anything.
- **Non-blocking.** Background compression never delays your response.

---

## License

MIT
