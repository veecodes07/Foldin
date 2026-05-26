import 'dotenv/config';
import createFold from './index.js';

// ─── Compress ─────────────────────────────────────────────────────────────────

const compress = async (prompt) => {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.2:3b",
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.message.content;
};

// ─── Storage factory ──────────────────────────────────────────────────────────

function makeStorage() {
  const db = new Map();
  return {
    get: async (id) => db.get(id) ?? null,
    set: async (id, state) => db.set(id, state),
    raw: db,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function assertEq(a, b, label) {
  assert(a === b, `${label} (got: ${JSON.stringify(a)}, expected: ${JSON.stringify(b)})`);
}

function section(name) {
  const dashes = "─".repeat(Math.max(0, 50 - name.length));
  console.log(`\n── ${name} ${dashes}`);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForTurn(storage, id, expectedTurn, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = storage.raw.get(id);
    if (state?.turnCount === expectedTurn) return state;
    await wait(200);
  }
  throw new Error(`Timeout waiting for turnCount=${expectedTurn} on "${id}"`);
}

// ─── Realistic conversation data ─────────────────────────────────────────────
// Messages are realistic length — 40 to 120 tokens each, like real production use

const conv = [
  [
    "Hi, I'm Arjun Mehta, a 28-year-old software engineer based in Bangalore. I've been working at a fintech startup for 3 years and I'm thinking about making a career switch into machine learning. I have a decent Python background but no formal ML experience. Where should I start?",
    "Hi Arjun! Given your Python background and software engineering experience, you're actually in a great position to transition into ML. I'd recommend starting with Andrew Ng's Machine Learning Specialization on Coursera — it's the most structured path for someone with your profile. Alongside that, get comfortable with NumPy, pandas, and scikit-learn. Your engineering skills will be a huge asset when it comes to building pipelines and deploying models, which is something many pure ML folks struggle with."
  ],
  [
    "That makes sense. I've actually already done some basic NumPy and pandas work in my current job for data analysis. My main concern is that I'm 28 and feel like I'm starting late compared to people who studied ML in college. Also I have a budget of around 50000 INR to spend on courses and resources over the next 6 months. Is that enough?",
    "28 is absolutely not late — in fact most strong ML engineers come from software backgrounds exactly like yours, and companies value that hybrid profile enormously right now. Your 50000 INR budget over 6 months is more than enough. The Coursera specialization is around 4000 INR per month, fast.ai is free, and Kaggle is free. You could spend the rest on a good GPU cloud budget for experiments. The bigger investment is time, not money — plan for around 10 hours a week consistently."
  ],
  [
    "Good to know about the budget. I can realistically do about 8 to 10 hours a week given my current job. My goal is to either transition internally at my current company which does have a data team, or find a new ML role within 12 months. I'm particularly interested in NLP because a lot of the fintech problems I've seen involve document processing, fraud detection narratives, and customer support automation. Does that narrow things down?",
    "NLP is a great focus for someone with your fintech background — document processing, fraud narrative analysis, and support automation are all high-demand use cases and you already understand the business context which is rare. I'd recommend this path: months 1 to 2 on ML fundamentals and classical NLP, months 3 to 4 on transformers and Hugging Face, months 5 to 6 on building two portfolio projects specifically in fintech NLP. The internal transition angle is smart — try to get involved in your company's data team projects even informally before the 12-month mark."
  ],
  [
    "The 6-month roadmap sounds solid. One thing I should mention is that I also have a side project idea — I want to build a tool that automatically extracts and summarizes key clauses from loan agreements and financial contracts. I think this could be useful both as a portfolio piece and potentially as a small SaaS product. Is this a realistic project for someone at my stage, and what stack would you recommend for it?",
    "That's actually an excellent project idea — contract clause extraction is a well-defined NLP problem, very relevant to your fintech experience, and genuinely useful as a portfolio piece. It's realistic within your 6-month timeline if you scope it right. For the stack I'd go with Python, Hugging Face Transformers for the NLP layer (fine-tune a BERT or LayoutLM model for document understanding), FastAPI for the backend, and a simple React frontend if you want to demo it. For the SaaS angle, keep the MVP very tight — upload a PDF, get back a structured JSON of key clauses. Don't over-engineer it early."
  ],
  [
    "I like that scope. My co-founder for this side project would be my friend Neha Sharma who is a lawyer and can help label training data and validate the clause extraction quality. We're thinking of calling it ClauseMind. Do you think having a domain expert like Neha involved from the start changes the approach in any meaningful way?",
    "Having Neha involved from the start is genuinely a competitive advantage — most ML projects fail not because of the model but because of bad labels and no domain validation. With a lawyer labeling and reviewing outputs you can build a much higher quality training dataset and catch edge cases early. It changes your approach in a few concrete ways: spend more time on the annotation schema upfront (what exactly counts as a 'payment clause' vs a 'penalty clause'), use active learning to prioritize which contracts Neha labels next, and build an evaluation framework that uses her feedback as ground truth. ClauseMind is a good name — memorable and descriptive."
  ],
  [
    "This is really helpful. To summarize where we are: I'm Arjun, 28, software engineer in Bangalore, transitioning to ML with a focus on NLP for fintech. Budget is 50000 INR over 6 months, 8 to 10 hours per week available. 12-month goal is an ML role, either internal or external. Side project is ClauseMind, a contract clause extraction SaaS, co-founded with Neha Sharma who is a lawyer. Stack is Python, Hugging Face, FastAPI, React. What should my very first week look like in concrete terms?",
    "Great summary. Here's your first week concretely: Day 1 — enroll in the Andrew Ng specialization and set up your Python ML environment with conda, install scikit-learn, pandas, matplotlib. Day 2 to 3 — complete weeks 1 and 2 of the specialization, focus on linear regression and cost functions, do the coding exercises. Day 4 — explore the Hugging Face course introduction, just read and run the examples, don't build anything yet. Day 5 — look at 10 real loan agreements online, sit with Neha and sketch out a rough list of 8 to 10 clause types you want ClauseMind to detect. Weekend — set up a GitHub repo for ClauseMind, write a one-page product spec. That's it. No code for ClauseMind yet — foundations first."
  ],
  [
    "Perfect. One more constraint I forgot to mention — I'm getting married in month 4 of this plan, so that month will probably only give me 3 to 4 hours a week instead of 8 to 10. Should I restructure the roadmap to account for that, or just push through and accept slower progress that month?",
    "Definitely restructure rather than push through — trying to force 8 hours during wedding month will just create stress and inconsistent learning, which is worse than planned slower progress. Here's the adjustment: move the transformer and Hugging Face deep-dive to months 3 and 5, use month 4 as a lighter consolidation month focused only on reading papers, reviewing what you've learned, and having one or two low-effort sessions with Neha on the ClauseMind annotation schema. This actually works in your favor — month 4 becomes a reflection and planning month so you enter month 5 refreshed and clear on what to build."
  ],
  [
    "That restructuring makes sense. Last question for today — I have a friend who keeps telling me I should just do a full-time ML bootcamp instead of this self-study path. The bootcamp he recommends costs 300000 INR and is 6 months full-time which would mean quitting my job. Given everything you know about my situation, what's your honest take on bootcamp vs self-study for me specifically?",
    "Honestly, the bootcamp is the wrong choice for your specific situation. Here's why: you already have software engineering skills which is what most bootcamps spend 30 percent of their time building, so you'd be paying for content you don't need. 300000 INR plus 6 months of lost salary from a fintech job is a very high cost when your 50000 INR self-study path covers the same ML content. You have a concrete project in ClauseMind that will demonstrate more to employers than a bootcamp certificate. And your internal transition path at your current company is a real option that a bootcamp would eliminate. The only case where the bootcamp makes sense is if you have zero discipline for self-study — but the fact that you've thought this through in detail suggests that's not you."
  ],
];

// ─── Test 1: createFold validation ───────────────────────────────────────────

section("1. createFold — bad inputs throw");

try {
  createFold({ storage: null, compress });
  assert(false, "null storage should throw");
} catch (e) {
  assert(e instanceof TypeError, "null storage throws TypeError");
}

try {
  createFold({ storage: { get: async () => {}, set: async () => {} }, compress: "notafunction" });
  assert(false, "non-function compress should throw");
} catch (e) {
  assert(e instanceof TypeError, "non-function compress throws TypeError");
}

try {
  createFold({ storage: { get: async () => {} }, compress });
  assert(false, "storage missing set should throw");
} catch (e) {
  assert(e instanceof TypeError, "storage missing set throws TypeError");
}

// ─── Test 2: pack on fresh state ─────────────────────────────────────────────

section("2. pack — fresh conversation");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });

  const { messages } = await fold.pack("fresh-001", conv[0][0]);

  assertEq(messages.length, 1, "no system prompt on fresh state");
  assertEq(messages[0].role, "user", "message role is user");
  assertEq(messages[0].content, conv[0][0], "user message content preserved");
}

// ─── Test 3: reset clears state ──────────────────────────────────────────────

section("3. reset — clears all state");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });

  fold.update("reset-001", conv[0][0], conv[0][1]);
  await waitForTurn(storage, "reset-001", 1);

  assert(storage.raw.get("reset-001") !== null, "state exists before reset");

  await fold.reset("reset-001");

  const after = storage.raw.get("reset-001");
  assertEq(after.turnCount, 0, "turnCount is 0 after reset");
  assertEq(after.stateVector, "", "stateVector is empty after reset");
  assertEq(Object.keys(after.factWatchlist).length, 0, "factWatchlist is empty after reset");

  const { messages } = await fold.pack("reset-001", conv[0][0]);
  assertEq(messages.length, 1, "pack after reset has no system prompt");
}

// ─── Test 4: turnCount increments ────────────────────────────────────────────

section("4. update — turnCount increments");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });

  for (let i = 0; i < 4; i++) {
    fold.update("count-001", conv[i][0], conv[i][1]);
    const state = await waitForTurn(storage, "count-001", i + 1);
    assertEq(state.turnCount, i + 1, `turnCount is ${i + 1} after turn ${i + 1}`);
  }
}

// ─── Test 5: facts are extracted and accumulate ───────────────────────────────

section("5. update — facts extracted and accumulate");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });

  fold.update("facts-001", conv[0][0], conv[0][1]);
  await waitForTurn(storage, "facts-001", 1);

  fold.update("facts-001", conv[1][0], conv[1][1]);
  await waitForTurn(storage, "facts-001", 2);

  const facts = storage.raw.get("facts-001").factWatchlist;
  assert(Object.keys(facts).length > 0, "facts extracted (non-empty)");
  console.log("  ℹ facts captured:", facts);
}

// ─── Test 6: state vector rewrites at turn 3 ─────────────────────────────────

section("6. update — state vector rewrites at turn 3");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });

  fold.update("sv-001", conv[0][0], conv[0][1]);
  await waitForTurn(storage, "sv-001", 1);
  assertEq(storage.raw.get("sv-001").stateVector, "", "stateVector empty after turn 1");

  fold.update("sv-001", conv[1][0], conv[1][1]);
  await waitForTurn(storage, "sv-001", 2);
  assertEq(storage.raw.get("sv-001").stateVector, "", "stateVector empty after turn 2");

  fold.update("sv-001", conv[2][0], conv[2][1]);
  await waitForTurn(storage, "sv-001", 3);
  await wait(10000);

  const sv = storage.raw.get("sv-001").stateVector;
  assert(sv.length > 0, "stateVector populated after turn 3");
  console.log("  ℹ state vector:", sv);
}

// ─── Test 7: pack injects system message after state exists ──────────────────

section("7. pack — system message injected after state exists");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });

  for (let i = 0; i < 3; i++) {
    fold.update("pack-001", conv[i][0], conv[i][1]);
    await waitForTurn(storage, "pack-001", i + 1);
  }
  await wait(10000);

  const { messages } = await fold.pack("pack-001", conv[3][0]);
  assert(messages.length >= 2, "system prompt present after state exists");
  assertEq(messages[0].role, "system", "first message is system");
  assert(messages[0].content.length > 0, "system message is non-empty");
  assertEq(messages[messages.length - 1].role, "user", "last message is always user");
  console.log("  ℹ system content:", messages[0].content);
}

// ─── Test 8: conversation isolation ──────────────────────────────────────────

section("8. isolation — separate IDs don't bleed");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });

  fold.update("convo-A", conv[0][0], conv[0][1]); // Arjun in Bangalore
  fold.update("convo-B", "Hi I am Priya and I live in Delhi. I run a D2C clothing brand with 15 employees and annual revenue of 2 crore INR. I need help thinking through whether to raise a seed round or stay bootstrapped.", "That's a classic inflection point for a D2C founder. At 2 crore ARR with 15 employees you have real proof of concept. The key question before deciding on funding is whether your growth is currently constrained by capital or by distribution and product-market fit. If you're capital constrained — meaning you have clear channels that work but can't pour more money in — then a seed round makes sense. If you're still figuring out what works, outside capital just accelerates mistakes.");

  await waitForTurn(storage, "convo-A", 1);
  await waitForTurn(storage, "convo-B", 1);

  const factsA = JSON.stringify(storage.raw.get("convo-A")?.factWatchlist ?? {}).toLowerCase();
  const factsB = JSON.stringify(storage.raw.get("convo-B")?.factWatchlist ?? {}).toLowerCase();

  assert(!factsA.includes("priya") && !factsA.includes("delhi"), "convo-A has no convo-B facts");
  assert(!factsB.includes("arjun") && !factsB.includes("bangalore"), "convo-B has no convo-A facts");
  console.log("  ℹ facts A:", storage.raw.get("convo-A")?.factWatchlist);
  console.log("  ℹ facts B:", storage.raw.get("convo-B")?.factWatchlist);
}

// ─── Test 9: context size — log only ─────────────────────────────────────────

section("9. context size — breakdown log");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });
  const id = "size-001";
  const avgCharsPerToken = 4;
  const sizes = [];

  for (let i = 0; i < conv.length; i++) {
    const { messages } = await fold.pack(id, conv[i][0]);
    sizes.push(JSON.stringify(messages).length);
    fold.update(id, conv[i][0], conv[i][1]);
    await waitForTurn(storage, id, i + 1);
  }

  console.log("\n  ℹ per-turn breakdown:");
  let rh = "";
  for (let i = 0; i < conv.length; i++) {
    rh += `User: ${conv[i][0]}\nAssistant: ${conv[i][1]}\n`;
    const saved = rh.length - sizes[i];
    const marker = i < 2 ? "–" : saved > 0 ? "✓" : "✗";
    console.log(`    turn ${String(i + 1).padStart(2)}: fold=${String(sizes[i]).padStart(5)} raw=${String(rh.length).padStart(5)} saved=${String(saved).padStart(5)} ${marker}`);
  }

  const lastFold = sizes[sizes.length - 1];
  assert(lastFold < rh.length * 2, `fold context (${lastFold}) not exploding vs raw (${rh.length})`);
}

// ─── Test 10: resilience — compress error does not crash ─────────────────────

section("10. resilience — compress error does not crash");

{
  const storage = makeStorage();
  let callCount = 0;

  const flakyCompress = async (prompt) => {
    callCount++;
    if (callCount === 1) throw new Error("Simulated compress failure");
    return compress(prompt);
  };

  const fold = createFold({ storage, compress: flakyCompress });
  fold.update("err-001", conv[0][0], conv[0][1]);
  await wait(3000);

  assert(true, "flaky compress does not crash the process");
  console.log("  ℹ error swallowed by enqueue as expected");
}

// ─── Token savings report ─────────────────────────────────────────────────────

section("Token savings report");

{
  const storage = makeStorage();
  const fold = createFold({ storage, compress });
  const id = "report-001";
  const avgCharsPerToken = 4;

  let foldTotal = 0;
  let rawTotal = 0;
  let rawHistory = "";

  console.log(`\n  ${"Turn".padEnd(6)} ${"With Fold".padStart(10)} ${"Without Fold".padStart(13)} ${"Saved".padStart(8)} ${"Savings".padStart(9)}`);
  console.log(`  ${"─".repeat(52)}`);

  for (let i = 0; i < conv.length; i++) {
    const { messages } = await fold.pack(id, conv[i][0]);
    const foldTokens = Math.round(JSON.stringify(messages).length / avgCharsPerToken);

    fold.update(id, conv[i][0], conv[i][1]);
    await waitForTurn(storage, id, i + 1);

    rawHistory += `User: ${conv[i][0]}\nAssistant: ${conv[i][1]}\n`;
    const rawTokens = Math.round(rawHistory.length / avgCharsPerToken);

    foldTotal += foldTokens;
    rawTotal += rawTokens;

    const saved = rawTokens - foldTokens;
    const pct = rawTokens > 0 ? Math.round((saved / rawTokens) * 100) : 0;
    const marker = i < 2 ? " " : saved > 0 ? "✓" : "✗";

    console.log(`  ${String(i + 1).padEnd(6)} ${String(foldTokens).padStart(10)} ${String(rawTokens).padStart(13)} ${String(saved).padStart(8)} ${String(pct + "%").padStart(8)} ${marker}`);
  }

  const totalSaved = rawTotal - foldTotal;
  const totalPct = Math.round((totalSaved / rawTotal) * 100);

  console.log(`  ${"─".repeat(52)}`);
  console.log(`  ${"TOTAL".padEnd(6)} ${String(foldTotal).padStart(10)} ${String(rawTotal).padStart(13)} ${String(totalSaved).padStart(8)} ${String(totalPct + "%").padStart(8)}`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(52));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("═".repeat(52) + "\n");

if (failed > 0) process.exit(1);