# 🔬 Behind the curtains
## 🐳 Containers layout
The following is the containerised layout of this app:

```
┌─────────────────────────────────────────┐
│              Browser                    │
│                                         │
│  React + Vite (served by nginx :8080)   │
│  • Stores API key in localStorage       │
│  • Runs agents sequentially             │
│  • Loads prompts from prompts.yaml      │
│  • User picks provider in Settings      │
└───────────────────┬─────────────────────┘
                    │ POST /api/chat
                    │ { provider, model, system, messages }
                    │ (x-user-api-key header)
                    ▼
┌─────────────────────────────────────────┐
│           Proxy Container               │
│                                         │
│  Node.js HTTP server (:3001)            │
│  • Validates API key is present         │
│  • Reads `provider` from request body   │
│  • Routes to correct SDK client         │
│  • Returns plain-text response          │
└──────┬─────────────┬────────────────┬───┘
       │             │                │
       │ HTTPS       │ HTTPS          │ HTTPS
       ▼             ▼                ▼
 api.anthropic  api.openai.com   generativelanguage
 .com           /v1/chat          .googleapis.com
 (Anthropic)    (OpenAI)          (Google Gemini)
```

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| 🖥️ Frontend | `react` ^18.3.1, `react-dom` ^18.3.1 |
| 📖 Markdown rendering | `react-markdown` ^9.0.1 |
| ⚡ Build tool | `vite` ^5.4.2 + `@vitejs/plugin-react` ^4.3.1 |
| 📝 Prompts | [`src/config/prompts.yaml`](src/config/prompts.yaml), loaded at build time via `@modyfi/vite-plugin-yaml` ^1.1.1 |
| 🔀 API proxy | Node.js (no framework) + Vercel AI SDK `ai` ^4 |
| 🤖 AI provider SDKs | `@ai-sdk/anthropic` ^1, `@ai-sdk/openai` ^1, `@ai-sdk/google` ^1 |
| 🌐 Static serving | nginx Alpine |
| 🐳 Containerisation | Docker Compose, two services on an internal network |

**Why a proxy?**
Browsers cannot call the Anthropic API directly due to CORS restrictions. The proxy container sits between the browser and the API, attaches the user's key from the request header, and forwards the call. The key is never stored server-side; it travels only in the HTTP header of each request.

---

## 📁 Folder Reference

### `src/`

| Path | Purpose |
|---|---|
| `main.jsx` | App entry point — mounts React root into `index.html` |
| `App.jsx` | Root component, phase machine, all shared state |
| `App.css` | Global styles |
| `components/ConfigPanel.jsx` | Settings modal: provider, model, API key |
| `components/Field.jsx` | Reusable labelled form field wrapper |
| `components/ScoreCard.jsx` | Circular percentage score display |
| `components/AgentReport.jsx` | Collapsible card for a single agent's output |
| `config/agents.js` | `AGENTS` array (id, label, icon, color, prompt) and `SYNTHESISER_PROMPT` |
| `config/models.js` | `PROVIDERS` and `MODELS` catalogue for the settings dropdown |
| `config/prompts.yaml` | All agent and synthesiser system prompts (loaded at build time) |
| `lib/llm.js` | `callLLM()` — single function that POSTs to `/api/chat` |
| `lib/utils.js` | `DEFAULT_CONFIG`, `analyserCouldNotAccess()`, `extractScore()` |

### `proxy/`

| Path | Purpose |
|---|---|
| `server.js` | Node.js HTTP server on `:3001` — validates API key, routes to AI provider via Vercel AI SDK |
| `package.json` | Proxy dependencies (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) |
| `Dockerfile` | Builds the proxy container image |

---

## 🔀 Request Path

```
Browser (React)
  └─ callLLM()          POST /api/chat  →  proxy/server.js
                                               └─ Vercel AI SDK
                                                    └─ Provider API (Anthropic / OpenAI / Gemini)
                                                         └─ text response back through the chain
```

The proxy validates that an API key is present in the `x-user-api-key` header before forwarding. It never holds a server-side key — the user's key is stored only in their own `localStorage` and sent per-request.

---

## 🔄 UI Phase Machine

`App.jsx` drives everything through a single `phase` state variable:

```
🟡 idle  ──[Run Evaluation]──►  🟢 running  ──[all agents done]──►  🔵 done
  ▲                                                                    │
  └──────────────[Evaluate Another Session]────────────────────────────┤
                                                                       │
                    🟠 resubmit  ◄──[Try Another Session]─────────────┘
                          │
                          └──[Re-Evaluate]──► 🟢 running ──► 🔵 done
```

| Phase | What the user sees |
|---|---|
| 🟡 `idle` | Input form (title, abstract, event URL, CFP URL) |
| 🟢 `running` | Per-agent progress cards, backoff countdown (only when rate limited or a delay is configured), optional CFP paste fallback |
| 🔵 `done` | Score cards, all agent reports, synthesis, export/reset buttons |
| 🟠 `resubmit` | Minimal form for a new title + abstract; agents 3 & 4 re-run, agents 1 & 2 are reused |

---

## 🤖 Agent Pipeline

Agents run in **dependency waves**. The CFP Analyser and Conference Researcher take only the session context, so they
are dispatched **concurrently**; the Programme Committee and Audience agents consume their output and so stay sequential,
as does the final synthesis. Adding an agent to `INDEPENDENT_AGENT_IDS` in `src/App.jsx` puts it in the concurrent wave —
only do that for an agent whose prompt needs nothing but the session context.

### Conference research (deterministic retrieval)

Before the Conference Researcher is prompted, the proxy fetches the conference's own programme pages
(`POST /api/research` → `proxy/research.js`). This is a plain HTTP fetch: no LLM, no API key, no third-party
service, nothing billed. It ranks links from the event page for programme/archive likelihood, extracts the top
few, and returns a digest capped at ~12k characters with a source URL per section.

It is best-effort and honest about failing. Static sites (FOSDEM, All Things Open) succeed; JavaScript-rendered
programmes (Cisco Live) and bot-blocked hosts (sched.com, HTTP 403) do not. Failure is detected on *extracted
content*, not HTTP status — a JS shell returns 200 with almost nothing — via `MIN_DIGEST_CHARS` /
`MIN_TITLE_LINES` in `proxy/research.js`.

When retrieval fails, the UI asks the submitter to paste a few past session titles and re-runs the Researcher
with them, mirroring the existing CFP-paste fallback. Skipping is allowed: the Researcher then answers from
training memory, and its prompt requires that to be reported under `FROM TRAINING — UNVERIFIED`, separate from
`PAST ACCEPTED TALKS — VERIFIED`, which may only contain titles read from retrieved material.

Guardrails: whole-operation budget `TOTAL_BUDGET_MS` (18s) on top of per-request timeouts, at most 3 pages,
a descriptive User-Agent, a politeness delay, and a minimal `robots.txt` check that fails open.

> **Why the Researcher is safe to parallelise:** it works from the conference URL and its own training knowledge and never
> reads the CFP text. If the Analyser reports it could not fetch the CFP and the user pastes the text in, the session
> context is rebuilt and only the Analyser re-runs — the Researcher's result is unaffected.

> **Resubmit flow:** the Committee and Audience agents read the *preserved* Analyser/Researcher output, which is already
> available before either starts. They therefore have no dependency on each other and run **concurrently** — the whole
> resubmit is two waves (Committee + Audience, then synthesis) rather than the first run's three.

Rate limits are handled *reactively* rather than
pre-emptively: the proxy retries a 429 up to `MAX_RETRIES` times via the AI SDK, and any 429 that still surfaces is
retried client-side (`callWithRetry`) using the provider's `Retry-After` value, falling back to exponential backoff.
`config.agentDelay` adds an optional fixed gap between agents and defaults to **0**.

```
1. CFP Analyser [🔍]      ── reads CFP URL, extracts themes/rules/signals
        │
        ▼  (fallback: if URL unreachable, user pastes text → analyser re-runs)
2. Conference Researcher [📚] ── researches event DNA, past accepted talks
        │
        ▼  (receives researcher output)
3. Programme Committee Member [🎯] ── scores relevance, originality, clarity, credibility, value
        │
        ▼  (receives researcher output)
4. Audience Member [🙋]  ── scores interest, clarity, value, FOMO
        │
        ▼  (receives committee + audience output, truncated to 1 200 chars each)
5. Synthesiser (🧠)   ── produces final scores, rewrites, actionable edits
```

Each agent call is:
```js
callLLM(config, agent.role, buildAgentMessage(agent.id), maxTokens)
```

`buildAgentMessage()` injects earlier agents' output as context for agents that depend on prior results (committee gets researcher + analyser; audience gets researcher).

---

## ⚙️ Config & Settings

`ConfigPanel.jsx` lets the user pick provider, model, and paste their API key. Settings are written to `localStorage` under the key `cfp-session-eval-council-config` on every change.

Default config (`src/lib/utils.js` + `src/config/models.js`):
```js
{
  provider: "anthropic",
  apiKey: "",
  agentDelay: 0,         // optional extra seconds between agent calls (0 = off)
  model: "claude-sonnet-4-6"
}
```

---

## 📋 CFP Text Fallback

If the analyser's response contains phrases like `"cannot access"` or `"please provide"`, `analyserCouldNotAccess()` returns `true` and execution pauses. A textarea appears mid-run for the user to paste the CFP content. On submit, the context is rebuilt and the analyser re-runs before the pipeline continues.

---

## 🎯 Score Extraction

After synthesis, two scores are parsed out of the free-text response using a regex in `extractScore()` (`src/lib/utils.js`):

- **Acceptance Likelihood** — matches `Acceptance Likelihood: 85%`
- **Audience Appeal** — matches `Audience Appeal: 72%`

These drive the `ScoreCard` components at the top of the results view.

---

## 🗺️ Component Map

```
App.jsx  (phase machine, all state)
├── ConfigPanel.jsx   — settings modal (provider / model / API key)
├── Field.jsx         — labelled form field wrapper
├── ScoreCard.jsx     — circular score display (Acceptance / Audience)
└── AgentReport.jsx   — collapsible card showing one agent's full output
```

---

## ↩️ ↩️ Resubmit Flow

"Try another session for this event" lets the user test a different title/abstract without re-running the expensive CFP Analyser and Conference Researcher calls.

1. Agent results for `analyser` and `researcher` are preserved in local variables.
2. Only `committee` and `audience` agents re-run with the new session context.
3. A new synthesis is generated from the fresh committee and audience outputs.
4. Phase returns to `done` with updated scores and reports.

---

## 📤 Export

"Export as .md" collects scores, all agent reports, and the synthesis into a Markdown string, wraps it in a `Blob`, and triggers a browser download — no server involved.
