# Foldin — Build Log

## What we shipped
A zero-dependency npm package that compresses LLM conversation history into ~300 tokens.
Published at `@vedsu/foldin`. Tested with a real LLM. Proven 71% token savings over 30 turns.

---

## Architecture decisions

**Single file, zero deps** — everything lives in `index.js`, under 200 lines, Node.js built-ins only. No exceptions.

**Factory function over class** — `createFold({ storage, compress })` is cleaner and less opinionated than `new SemanticZip()`.

**3-layer context system**
- State Vector (~200 tokens) — rolling summary, rewritten every 3 turns
- Fact Watchlist (~50 tokens) — hard facts as `key:value`, never lost
- Retrieval Index (0-200 tokens) — keyword index, only injected when relevant to the message

**Bring your own everything** — storage and AI are passed as functions. Fold never imports a single SDK. If an AI assistant ever tries to `import Anthropic from '@anthropic-ai/sdk'` inside this file, the answer is no.

**Per-conversation queue** — each conversation's updates run serially via a Promise chain stored in a `Map`. This was the key architectural fix.

---

## Bugs we hit and fixed

### Bug 1 — Turn count race condition (took 2 attempts)
**Symptom:** Test 4 failing. Turn count landing at 1 or 2 instead of 3 after 3 updates.

**Attempt 1 — wrong fix:** Stopped the background task from writing `turnCount`. But the real problem was deeper — each `update()` call was async and returned a Promise, but the background AI work ran inside a floating `Promise.resolve().then()`. So `await fold.update()` resolved immediately before anything was written. All three calls read `turnCount: 0` from storage simultaneously.

**Attempt 2 — real fix:** Replaced the floating promises with a **per-conversation queue**. Each `update()` is now fire-and-forget. Internally it chains onto a `Map` of Promises — one chain per conversationId. Updates for the same conversation always run one after another, in order. Different conversations never block each other.

**Key insight:** `update()` returning `void` is correct by design — you never want to `await` compression work on the hot path.

---

### Bug 2 — Groq model decommissioned
**Symptom:** `TypeError: Cannot read properties of undefined (reading '0')` on every turn during real LLM test.

**Cause:** `llama3-8b-8192` was decommissioned by Groq.

**Fix:** Swapped to `llama-3.3-70b-versatile`. One line change.

---

## Real world test results

Ran a 30-turn simulated conversation through Groq's free API.

```
Total tokens WITH Foldin:    ~3,000
Total tokens WITHOUT Foldin: ~10,242
Tokens saved:                ~7,242
Savings:                     71%
```

Facts correctly extracted and persisted across turns:
`Name, Location, budget, currency, launch_time, Technology, Domain, signups...`

State vector rewrote at turn 3 and turn 6 as designed.

**Known issue to fix before v1:** Fact extraction is noisy — `User: 'User'`, `Helper: 'Assistant'` are garbage extractions. The fact extraction prompt needs tightening.

---

## Publishing

- Name `fold` — taken (origami package)
- Name `foldin` — blocked by npm spam filter, too similar to `for-in`
- Final published name: **`@vedsu/foldin`** (scoped)
- Size: **5.2 kB** published, 13.9 kB unpacked

```bash
npm install @vedsu/foldin
```

---

## What's next
- Tighten fact extraction prompt — filter out noise
- Test inside a real chatbot project
- Get real token savings data from a production conversation
- Publish v0.2.0 with prompt improvements