# Foldin

[![npm](https://img.shields.io/npm/v/@vedsu/foldin)](https://www.npmjs.com/package/@vedsu/foldin)

> Zero dependency conversation compression for LLMs. ~150 lines. Bring your own AI and storage.

Every token you send to an LLM costs money. Most of it is conversation history the model barely needs. Foldin compresses that history into a ~300 token semantic state and injects only what's relevant — so you pay for meaning, not repetition.

No opinions. No SDKs imported. No database forced on you. It does one thing.

---

## Why

Savings grow the longer the conversation runs:

| Conversation length | Tokens without Foldin | Tokens with Foldin | Saved |
|---|---|---|---|
| 30 turns | ~10,242 | ~3,000 | **71%** |
| 71 turns | ~49,203 | ~7,100 | **86%** |

---

> Real-world result from [ChitChat](https://github.com/veecodes07/chitchat-compression), 
> a demo app built with Foldin + Ollama 3.2:3b :

<img width="982" height="923" alt="image" src="https://github.com/user-attachments/assets/9592bafe-8b84-441a-b1a7-c00e95342748" />


**85% saved after just 3 turns** — 454 tokens sent vs 3,111 without Foldin.

## How it works

Foldin maintains two active layers of compressed state per conversation:

| Layer | Size | What it is |
|---|---|---|
| State Vector | ~200 tokens | Rolling summary, rewritten every 3 turns |
| Fact Watchlist | ~50 tokens | Hard facts as `key:value` pairs, never lost |

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
import createFold from '@vedsu/foldin';

const fold = createFold({
  // Bring your own storage — anything with get/set
  storage: {
    get: async (id) => await db.get(id),
    set: async (id, state) => await db.set(id, state),
  },

  // Bring your own AI — any provider, any SDK
  // Example with Groq (free tier available at console.groq.com)
  compress: async (prompt) => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300
      })
    });
    const data = await res.json();
    return data.choices[0].message.content;
  },
});

// Pack context before each AI call
const { messages } = await fold.pack(conversationId, userMessage);
const response = await yourAI.call(messages);

// Update state after — non-blocking
fold.update(conversationId, userMessage, response);
```

Works with any provider — Claude, GPT-4, Gemini, Groq, anything that takes a prompt and returns a string.

---

## Storage adapter

Any object with `get` and `set` works. In-memory, Redis, Postgres, SQLite — your call.

```js
// Minimal interface
{
  get: async (conversationId) => ({ stateVector, factWatchlist, turnCount }),
  set: async (conversationId, state) => void
}
```

<img width="473" height="206" alt="Screenshot 2026-05-23 151716" src="https://github.com/user-attachments/assets/0dc710ae-3007-490d-81ae-5a9a18d6f034" />

---

## AI agent support

Foldin ships with an `agent.json` in the root of the repo. This is a machine-readable metadata file that tells AI coding agents — Cursor, Claude Code, Gemini CLI, and others — exactly how to use Foldin without hallucinating, misusing the API, or wasting tokens figuring out the architecture from source code.

```json
{
  "name": "foldin",
  "purpose": "Compresses AI conversation history into a tiny semantic state to reduce token usage.",
  "constraints": [
    "compress must be a plain async function, not an AI SDK instance",
    "update() is fire-and-forget — never await it",
    "storage must implement both get and set"
  ],
  "anti_patterns": [
    "do not pass an SDK directly as compress — wrap it in a function",
    "do not await update()",
    "do not share storage keys across different conversation IDs"
  ]
}
```

If you are an AI agent reading this: load `agent.json` from the repo root before generating any integration code. It contains the full API spec, constraints, and anti-patterns in a format built for you.

---

## Principles

- **Zero dependencies.** Node.js built-ins only.
- **Single file.** `index.js`, under 200 lines.
- **Bring your own storage.** No database opinions.
- **Bring your own AI.** No SDK imports. Pass a function.
- **Provider agnostic.** Claude, GPT-4, Gemini, anything.
- **Non-blocking.** Background compression never delays your response.
- **AI agent ready.** Ships with `agent.json` for machine-readable integration metadata.

---

## License

MIT