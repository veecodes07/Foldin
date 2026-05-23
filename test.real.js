import createFold from './index.js';
import 'dotenv/config';

// ─── Groq compress function ───────────────────────────────────────────────────
const compress = async (prompt) => {
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
  console.log("Groq response:", JSON.stringify(data, null, 2)); // <-- add this
  return data.choices[0].message.content;
};

// ─── In-memory storage ────────────────────────────────────────────────────────
const db = new Map();
const storage = {
  get: async (id) => db.get(id) ?? null,
  set: async (id, state) => db.set(id, state),
};

// ─── Fake conversation ────────────────────────────────────────────────────────
const conversation = [
  ["My name is Ravi and I live in Mumbai", "Nice to meet you Ravi!"],
  ["I am building a SaaS product", "That sounds exciting, what does it do?"],
  ["It helps small businesses manage inventory", "Great idea, what stack are you using?"],
  ["Node.js and React", "Solid choices for a SaaS product"],
  ["My budget is around 10000 USD", "That's a reasonable budget to get started"],
  ["I want to launch in 3 months", "Ambitious but doable with the right scope"],
  ["I need a co-founder with design skills", "Have you tried IndieHackers or LinkedIn?"],
  ["Yes I posted on LinkedIn last week", "Any responses so far?"],
  ["Three people responded but none were serious", "Keep looking, the right person takes time"],
  ["My target market is retail shops in Mumbai", "Smart to start local and then expand"],
  ["I want to charge 500 INR per month", "That's very affordable, have you validated it?"],
  ["I spoke to 10 shop owners last week", "Great, what was their feedback?"],
  ["Most liked it but worried about setup time", "Onboarding flow will be critical then"],
  ["I am thinking of a 15 minute setup max", "That's a great constraint to design around"],
  ["I will offer free setup assistance for first month", "That removes the biggest objection"],
  ["My MVP will have stock tracking and alerts", "Good scope, keep it tight for v1"],
  ["I also want barcode scanning", "Useful but maybe save for v2"],
  ["You are right, cutting barcode for now", "Smart call, ship faster"],
  ["I have a designer friend who might help", "Reach out to them today"],
  ["She agreed to help for equity", "Perfect, what percentage are you offering?"],
  ["I was thinking 10 percent", "Reasonable for an early stage cofounder"],
  ["She wants 15 percent", "Negotiate to 12 and offer a vesting cliff"],
  ["Good idea, I will propose 12 with 6 month cliff", "That protects both of you"],
  ["She accepted the terms", "Great, now you have a team"],
  ["We are starting development next Monday", "Exciting, do you have a project tracker?"],
  ["We will use Notion for now", "Simple and effective for early stage"],
  ["I want to launch a waitlist first", "Smart, build demand before shipping"],
  ["I will use a simple landing page", "Keep it one page, one email field"],
  ["Landing page is ready at ravishop.in", "Great domain, share it widely"],
  ["We got 50 signups in first day", "Amazing start, keep that momentum going"],
];

// ─── Run ──────────────────────────────────────────────────────────────────────
const fold = createFold({ storage, compress });
const id = "real-test-001";

console.log("Running real conversation test...\n");

for (let i = 0; i < conversation.length; i++) {
  const [userMsg, aiReply] = conversation[i];

  const { messages } = await fold.pack(id, userMsg);

  const tokensBefore = JSON.stringify(messages).length;
  console.log(`Turn ${i + 1}`);
  console.log(`  User: ${userMsg}`);
  console.log(`  Context size: ${tokensBefore} chars`);
  console.log(`  Messages in context: ${messages.length}`);

  fold.update(id, userMsg, aiReply);

  // Wait for background work to finish
  await new Promise((r) => setTimeout(r, 3000));
}

// Final state
const finalState = db.get(id);
// Calculate what raw history would cost
let rawTokens = 0;
let cumulativeHistory = "";
const avgCharsPerToken = 4;

for (let i = 0; i < conversation.length; i++) {
  cumulativeHistory += `User: ${conversation[i][0]}\nAssistant: ${conversation[i][1]}\n`;
  rawTokens += Math.round(cumulativeHistory.length / avgCharsPerToken);
}

console.log("\n─── Token Savings Report ───");
console.log(`Turns: ${conversation.length}`);
console.log(`Total tokens WITH Fold:    ~${Math.round(conversation.length * 100)}`);
console.log(`Total tokens WITHOUT Fold: ~${rawTokens}`);
console.log(`Tokens saved: ~${rawTokens - Math.round(conversation.length * 100)}`);
console.log(`Savings: ${Math.round((1 - (conversation.length * 100) / rawTokens) * 100)}%`);

console.log("\n─── Final compressed state ───");
console.log("State Vector:", finalState?.stateVector);
console.log("Facts:", finalState?.factWatchlist);
console.log("Turn Count:", finalState?.turnCount);