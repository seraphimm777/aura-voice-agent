# Aria: AI Voice CX Agent for Aura Skincare

Browser-based voice support agent. Open the app, click **Start Call**, allow the mic, and talk to Aria.
**Use Chrome or Edge** (the Web Speech API is not supported in Firefox/Safari). Headphones recommended.

## Architecture
Mic -> Web Speech API (speech-to-text, en-IN) -> `/api/chat` (Gemini + function calling) -> Web Speech API (text-to-speech, Indian-English voice) -> speakers.

- `lib/orders.js`: mock order DB and tools: `get_order_details`, `check_cancellation_eligibility`, `cancel_order`, `check_return_eligibility`. Policy rules (7-day return window, cancel only while Processing) are enforced in code, not left to the LLM.
- `lib/prompt.js`: persona (Aria), brand policies, guardrails (scope, no promises outside policy, no invented order data, unclear audio, missing/invalid IDs).
- `lib/gemini.js`: calls Gemini with a fallback chain across several models (fast ones first) with timeouts, so an overloaded model doesn't break the call.
- `/api/summary`: transcript -> schema-constrained JSON (intent, order_id, resolution_status, call_summary).
- The API key stays server-side. Cancelled-order state is carried per call by the client, so the server is stateless and every new call starts fresh.

## Run locally
    npm install
    copy .env.example .env.local     (then add GEMINI_API_KEY)
    npm run dev
Open http://localhost:3000.

## Deploy (Vercel)
Push to GitHub, import the repo in Vercel, add the `GEMINI_API_KEY` environment variable, deploy. HTTPS is required for the microphone.

## Test orders
ORD-101 (Out for Delivery), ORD-102 (Delivered 14 days ago), ORD-103 (Processing). Also try an invalid ID (ORD-999), a missing ID, an out-of-scope request (flight to Goa), COD and shipping questions.

## Tell Us How You Think
(Edit these into your own words before submitting.)

**1. Why this architecture and stack?**
I chose a modular pipeline: browser speech recognition, an LLM with tool calling, and browser speech synthesis, in one Next.js app on Vercel. It needs no paid voice vendor, keeps the API key on the server, and every stage is easy to inspect and explain. The LLM decides when to call a tool from the tool descriptions and the system prompt; the tools enforce the business rules.

**2. Hardest part and how I solved it?**
Reliability. Speech recognition garbles order IDs, and the LLM API sometimes returned overload errors and timeouts. I normalised spoken IDs to ORD-xxx, moved policy checks into code, added a rule that the agent may only claim a cancellation if the cancel tool succeeded, and built a model fallback chain with timeouts.

**3. One more week?**
Barge-in (interrupting the agent) and a higher-quality Indian-voice TTS with streaming, since voice quality and latency matter most for the call feel. Then Hinglish testing and an evaluation set of scripted calls.

**4. 1,000 conversations a day?**
A real database for orders and call logs, caller authentication (for example OTP) before sharing order data, rate limiting and cost monitoring, streaming STT/TTS for lower latency, a human handoff path when the agent is stuck, monitoring and alerts, and automated regression tests of policy behaviour.
