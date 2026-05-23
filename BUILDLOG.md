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

## Session 2 — Prompt tightening & multi-LLM testing

### Fact extraction prompt — 3 iterations

**Problem:** Noisy extractions — `User: 'User'`, `Helper: 'Assistant'`, `answer: 'answer'`, `Ravi: 'Ravi'`.

**Iteration 1 — added Ignore clause:**
```
Ignore: speaker labels, filler words, questions without answers, relative time words like "today" or "now".
```
Killed `User: 'User'` and `Helper: 'Assistant'`. But conversational phrases still slipped through (`Good: 'point'`, `will: 'ask'`).

**Iteration 2 — added named subject requirement:**
```
Each key must be a specific noun or named thing (person, product, feature, metric).
```
Reduced filler further. Still saw `User: 'None'` and `Ravi: 'Ravi'` with some models.

**Iteration 3 — XML tags + explicit speaker label + key=value guard:**
```
Ignore: speaker labels (User, Assistant, Helper), ... anything where key and value are the same word.
```
Wrapped prompt in `<task>` and `<exchange>` XML tags to cleanly separate instruction from data. Universal pattern — works across all LLMs.

**Final prompt:**
```js
const FACT_EXTRACTION_PROMPT = (exchange) =>
  `<task>
Extract hard facts as key:value pairs under 50 tokens.
Only: names, numbers, locations, decisions, constraints, preferences.
Each key must be a specific noun or named thing (person, product, feature, metric).
Ignore: speaker labels (User, Assistant, Helper), filler words, questions without answers,
relative time words, anything where key and value are the same word.
Return only key:value pairs separated by |. If no facts found, return nothing.
</task>
<exchange>
${exchange}
</exchange>`;
```

---

### Multi-LLM testing — what we learned

Tested fact extraction across 4 providers/models:

| Model | Result |
|---|---|
| Groq — `llama-3.3-70b-versatile` | Clean facts, fast, no daily limits issue in normal use. Best overall. |
| Gemini | API setup issues, abandoned. |
| OpenRouter — `nvidia/nemotron-3-super-120b-a12b:free` | Reasoning model — thinks out loud, extracted its own prompt as facts. Wrong model type for this task. |
| OpenRouter — `openai/gpt-oss-20b:free` | Cleanest facts of all tested. But 200 req/day limit hit mid-test. |

**Key insight:** Fact extraction needs a fast instruction-following model, not a reasoning model. Reasoning models (Nemotron, o-series) think out loud and pollute the output. Groq Llama is the right default.

**Also confirmed:** The `compress` function is truly provider-agnostic — swapping models was always a one-line change. The architecture held perfectly.

---

### Test file restructure

Moved test file to a `test/` subfolder. Updated import from `'./index.js'` to `'../index.js'`. Run from project root: `node test/test.real.js`.

---

### Extended real-world test — 71 turns

Re-ran the test with a longer 71-turn simulated conversation (startup founder building a SaaS product over 7 days).

```
Total tokens WITH Foldin:    ~7,100
Total tokens WITHOUT Foldin: ~49,203
Tokens saved:                ~42,103
Savings:                     86%
```

**Observation:** Savings grow as conversation length increases. At 30 turns: 71%. At 71 turns: 86%. The longer the conversation, the more Foldin pays off.

**State vector quality was good** — correctly retained decisions (REST API, Mumbai pilot, ravishop.in domain, 3-month launch, Priya as design co-founder) across all 71 turns.

**Facts extracted correctly:** `name`, `location`, `budget`, `Co-founder`, `Stack`, `domain`, `barcode scanning feature`, `MRR`, `paying customers`, `price`, `signups`.

---

## What's next
- Publish v0.2.0 with tightened fact extraction prompt
- Build the hosted API endpoint (Vercel + Supabase + auth)
- Landing page with before/after token graph
- Test with Claude and GPT-4o as the compress model for quality comparison