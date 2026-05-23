## — SemanticZip Technical Requirements Document 

## What It Is 

A lightweight npm package that compresses AI conversation history into a tiny semantic state (~300 tokens) so developers pay for meaning, not words. Also ships as a hosted API endpoint. 

## - Core Philosophy (Non Negotiable) 

- 

- Zero dependencies. Use only Node.js built ins. 

- Single file core. Everything in one file, under 200 lines. 

- Bring your own storage. Accept a storage adapter as a function, don't force any DB. 

- Bring your own AI. Accept an AI caller as a function, don't import any AI SDK. 

- 

- Provider agnostic. Must work with Claude, GPT 4, Gemini, or any LLM. 

- 

- No opinions. The package does one thing compression. Nothing else. 

## How It Works (3 Layers) 

- 

- 1. State Vector (~200 tokens) rolling summary of the conversation, rewritten every 3 turns 

2. Fact Watchlist (~50 tokens) — hard facts extracted as key:value pairs, never lost 

3. Retrieval Index (0–200 tokens) — sparse keyword index, only injected when relevant 

~ Together these replace full conversation history with 300 tokens per API call. 

## npm Package 

## Interface 

## js 

const sz = new SemanticZip({ storage: storageAdapter, // object with get(id) and set(id, state) functions compress: aiFunction, // async function(prompt) => string }) const { messages } = await sz.pack(conversationId, newMessage) // pass `messages` to whatever AI API you want await sz.update(conversationId, newMessage, aiResponse) 

## What SemanticZip Does Internally 

- 

- pack() loads state from storage, assembles context payload, returns messages array 

- update() — increments turn count, extracts facts, triggers state rewrite every 3 turns 

- State rewrite — calls the passed-in compress function with a rewrite prompt 

- - 

- Fact extraction calls the passed in compress function with an extraction prompt 

## Storage Adapter Interface 

js 

// Whatever storage they use must implement: 

{ get: async (conversationId) => ({ stateVector, factWatchlist, chunkIndex, turnCoun set: async (conversationId, state) => void }   

## Constraints 

- No classes required if functions are cleaner 

- Must work in Node.js 18+ 

- No TypeScript required but export JSDoc types 

- State rewrite is async and non-blocking — never delay the main response 

- 

- Fact extraction is async and non blocking 

## Hosted API Endpoint 

## Stack 

- Node.js + Express 

- Vercel serverless deployment 

- Supabase Postgres for state storage 

- Claude Haiku for state rewrites (cheapest capable model) 

## Endpoint 

POST /v1/chat Headers: Authorization: Bearer <api_key> 

Body: { "conversationId": "string", 

"message": "string", "model": "claude | gpt4 | gemini" // optional, default claude 

} 

Response: identical format to standard AI API response 

## What the API Does 

- Receives message + conversationId 

- Loads compressed state from Supabase 

- ~ 

- Assembles 300 token context payload 

- Calls the requested AI model 

- Returns response to caller 

- Async: updates state, extracts facts, rewrites state every 3 turns 

## Supabase Schema 

sql CREATE TABLE conversations ( id TEXT PRIMARY KEY, state_vector TEXT, fact_watchlist TEXT, chunk_index JSONB, turn_count INTEGER DEFAULT 0, updated_at TIMESTAMP DEFAULT NOW() ); CREATE TABLE api_keys ( key TEXT PRIMARY KEY, user_id TEXT, plan TEXT, call_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW() ); 

## Auth 

API key via Authorization header 

Rate limit per plan: Hobby 500/mo, Starter 10k/mo, Pro 100k/mo 

## State Rewrite Prompt Template 

You are a conversation state manager. Current state: {currentState} Recent turns: {recentTurns} Rewrite the state in under 200 tokens. Include: - What has been decided or agreed - Current active topic - Key user facts (age, location, budget, constraints) - Open threads to follow up 

Be dense. Drop nothing important. Add nothing unnecessary. Return only the rewritten state, no explanation. 

## Fact Extraction Prompt Template 

Extract hard facts from this exchange as key:value pairs under 50 tokens. Only facts: names, numbers, locations, decisions, constraints. Exchange: {exchange} 

Return only key:value pairs separated by |. Nothing else. 

## Build Order 

1. Core compression logic (pack + update functions) 

2. Storage adapter interface 

3. State rewrite and fact extraction 

4. npm package — clean exports, JSDoc, README 

5. Vercel API endpoint 

6. Supabase integration 

7. API key auth and rate limiting 

8. Landing page (single HTML file) 

## What NOT to Build 

No dashboard yet 

- No user signup UI yet 

- No analytics yet 

- No streaming support yet 

## No TypeScript strict mode required 

No test suite required for MVP (manual testing is fine) 

