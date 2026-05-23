import createFold from './index.js';
import 'dotenv/config';

// ─── Groq compress function ───────────────────────────────────────────────────
const compress = async (prompt) => {
  const res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
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
  if (data.error) throw new Error(data.error.message);
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
  // Day 1 — Ideation
  ["My name is Ravi and I live in Mumbai", "Nice to meet you Ravi!"],
  ["I want to build a SaaS for inventory management", "Great idea, who is your target customer?"],
  ["Small retail shops in Mumbai first", "Smart to start local, easier to get feedback"],
  ["My budget is 10000 USD", "That's workable for an MVP"],
  ["I know React and Node.js", "Perfect stack for a SaaS product"],
  ["I want to launch in 3 months", "Tight but doable if scope is right"],
  ["My co-founder is Priya, she handles design", "Great, design co-founder is underrated"],
  ["We are calling it RaviShop", "Catchy, is the domain available?"],
  ["Yes ravishop.in is available", "Grab it today"],
  ["Done, bought ravishop.in", "Good move"],

  // Day 2 — Planning
  ["What should our MVP include?", "Stock tracking, low stock alerts, basic reporting"],
  ["Should we add barcode scanning?", "Save it for v2, ship faster"],
  ["Good call, cutting barcode", "Right decision"],
  ["How should we price it?", "Start at 500 INR per month, validate then raise"],
  ["We spoke to 15 shop owners yesterday", "What was the feedback?"],
  ["12 out of 15 loved it", "That's strong signal, move fast"],
  ["Main concern was setup time", "Make onboarding under 15 minutes"],
  ["We will offer free setup for first month", "Smart, removes the biggest objection"],
  ["Priya finished the first mockups", "How do they look?"],
  ["Clean and simple, shop owners loved it", "Design validation done, start building"],

  // Day 3 — Development starts
  ["We started building today", "What did you get done?"],
  ["Basic auth and dashboard skeleton", "Solid first day"],
  ["Using Supabase for the database", "Good choice, fast to set up"],
  ["Should we use REST or GraphQL?", "REST for MVP, simpler and faster"],
  ["Agreed, going with REST", "Good call"],
  ["How should we structure the API?", "Resource-based routes, versioned from day one"],
  ["Like /api/v1/products?", "Exactly"],
  ["What about authentication?", "JWT with refresh tokens"],
  ["Should we build auth ourselves?", "Use Supabase auth, don't reinvent it"],
  ["Already using Supabase so perfect", "Exactly, save time"],

  // Day 4
  ["Finished the products CRUD today", "Nice, what's next?"],
  ["Stock tracking logic", "Track quantity, threshold, last updated"],
  ["Should we support multiple locations?", "Not for MVP, one location per shop"],
  ["Makes sense", "Keep it simple"],
  ["Priya is building the onboarding flow", "How many steps?"],
  ["4 steps: signup, shop setup, add products, done", "Perfect, under 15 minutes easily"],
  ["We tested it, takes 11 minutes", "Great, ship that"],
  ["Low stock alert logic done", "How does it trigger?"],
  ["Email when stock drops below threshold", "Add WhatsApp later, shopkeepers prefer it"],
  ["Good idea, adding WhatsApp to roadmap", "Smart"],

  // Day 5
  ["We have a working prototype", "Time to test with real users"],
  ["Showing it to 5 shops tomorrow", "What do you need from them?"],
  ["Feedback on the flow and pricing", "Also ask if 500 INR is too much or too little"],
  ["Good point, will ask that", "Their answer will surprise you"],
  ["All 5 shops want to use it", "That's incredible, did any pay?"],
  ["2 shops paid 500 INR upfront", "You have revenue on day 5, that's rare"],
  ["We are very excited", "You should be, keep going"],
  ["One shop asked for GST invoice", "You will need to register the business"],
  ["We haven't registered yet", "Do it this week, you need it to scale"],
  ["Priya is handling the registration", "Good, divide and conquer"],

  // Day 6-7 — First week wrap
  ["We hit 10 paying customers", "First 10 are the hardest, well done"],
  ["MRR is 5000 INR", "Small but real, this is how it starts"],
  ["One customer wants bulk import", "CSV upload, add to v1.1 backlog"],
  ["Another wants mobile app", "Web first, responsive design buys you time"],
  ["We launched on a WhatsApp group for retailers", "How many people in the group?"],
  ["2000 members", "That's a goldmine, post carefully"],
  ["We got 50 signups from that post", "From one WhatsApp message?"],
  ["Yes in 3 hours", "Product market fit signal right there"],
  ["We are overwhelmed with onboarding requests", "Automate what you can, Priya does the rest"],
  ["We hired a part time helper for onboarding", "Smart, protect your build time"],

  // Week 2
  ["We now have 45 paying customers", "MRR?"],
  ["22500 INR per month", "Growing fast, any churn?"],
  ["2 customers churned", "Why?"],
  ["One said too expensive, one said too complex", "Fix the complexity first, price later"],
  ["We simplified the dashboard", "Good, what changed?"],
  ["Removed 3 unnecessary screens", "Less is more"],
  ["Retention improved after the change", "Always does"],
  ["We are getting referrals now", "Word of mouth is the best growth"],
  ["One shop told 4 others", "Build a referral incentive"],
  ["Free month for every referral?", "Yes, simple and effective"],
  ["Launched the referral program today", "Track it carefully"],

  
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
  await new Promise((r) => setTimeout(r, 3000)); // 3 seconds between turns
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