// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// AI elements and other utils
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { AGENTS, SYNTHESISER_PROMPT } from "./config/agents";
import { DEFAULT_MODELS } from "./config/models";
import { callLLM } from "./lib/llm";
import { DEFAULT_CONFIG, analyserCouldNotAccess, extractScore } from "./lib/utils";
import { fetchResearch, researchBlock } from "./lib/research";

// CSS styles
import "./App.css";

// App components
import ConfigPanel, { GearIcon } from "./components/ConfigPanel";
import Field from "./components/Field";
import ScoreCard from "./components/ScoreCard";
import AgentReport from "./components/AgentReport";

const APP_DEFAULT_CONFIG = { ...DEFAULT_CONFIG, model: DEFAULT_MODELS.anthropic };

// Agents whose only input is the session context. They have no upstream
// dependency on each other, so they are dispatched concurrently.
const INDEPENDENT_AGENT_IDS = ["analyser", "researcher"];

// Client-side retries for a 429 that survived the proxy's own retries.
const MAX_RATE_LIMIT_RETRIES = 3;
// Fallback backoff (seconds) when the provider sends no Retry-After header.
const RATE_LIMIT_BACKOFF_SECONDS = [5, 15, 30];

// Status line for the agents currently in flight. Names them all, since more
// than one runs at a time.
const runningLabel = (ids) => {
  const active = AGENTS.filter((a) => ids.includes(a.id));
  if (active.length === 0) return "Preparing agents...";
  if (active.length === 1) return `${active[0].icon} ${active[0].label} is analysing...`;
  return `${active.map((a) => a.icon).join(" ")} ${active
    .map((a) => a.label)
    .join(" and ")} are analysing in parallel...`;
};

/**
 * Assembles the user message for one agent: the session context, plus the
 * output of the upstream agents that agent is meant to read.
 *
 * Shared by the first run and the resubmit so the two cannot drift — they
 * previously had separate copies, and the Audience agent ended up reading the
 * CFP analysis on a resubmit but the conference research on a first run.
 *
 * An upstream section is omitted entirely when that agent produced no result,
 * so a failed agent's error text is never fed to a downstream agent.
 */
const buildAgentMessage = (agentId, sessionContext, results, retrieved = "") => {
  const sections = [sessionContext];
  if (agentId === "researcher" && retrieved) sections.push(retrieved);
  if (agentId === "committee" || agentId === "audience") {
    if (results.researcher) sections.push(`CONFERENCE ANALYSIS:\n${results.researcher}`);
  }
  if (agentId === "committee") {
    if (results.analyser) sections.push(`CFP ANALYSIS:\n${results.analyser}`);
  }
  return sections.join("\n\n---\n");
};

// Shown in place of the synthesis when every evaluator agent failed. Writing
// this into `synthesis` (rather than `error`) is what surfaces it, because the
// error banner only renders on the input screens, not the results screen.
const SYNTHESIS_UNAVAILABLE =
  "⚠️ **No synthesis could be produced.** Both evaluator agents failed, so there was nothing to synthesise. " +
  "See the agent reports below for the underlying error, then try again.";

/**
 * Root application component. Manages the full evaluation lifecycle:
 * idle form → running (multi-agent LLM calls with rate-limit countdowns) →
 * done (results + scores) → optional resubmit for the same event.
 *
 * All LLM provider settings and API keys are persisted to localStorage.
 */
export default function SessionEvaluator() {
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [cfpUrl, setCfpUrl] = useState("");
  const [cfpText, setCfpText] = useState("");
  const [needsCfpText, setNeedsCfpText] = useState(false);
  // Deterministic programme retrieval, and the user's pasted fallback for it.
  const [research, setResearch] = useState(null);
  const [needsPastTalks, setNeedsPastTalks] = useState(false);
  const [pastTalksDraft, setPastTalksDraft] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | running | done | resubmit
  const [agentResults, setAgentResults] = useState({});
  const [synthesis, setSynthesis] = useState("");
  // Ids of the agents currently in flight. A list, not a single id, because
  // the independent agents run concurrently.
  const [activeAgents, setActiveAgents] = useState([]);
  const [agentProgress, setAgentProgress] = useState([]);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [countdownTotal, setCountdownTotal] = useState(0);
  const [countdownLabel, setCountdownLabel] = useState("");
  const [resubmitTitle, setResubmitTitle] = useState("");
  const [resubmitAbstract, setResubmitAbstract] = useState("");
  const resultsRef = useRef(null);
  const cfpTextResolverRef = useRef(null);
  const pastTalksResolverRef = useRef(null);

  // Load config from localStorage or use defaults
  const [config, setConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cfp-session-eval-council-config") || "{}");
      const merged = { ...APP_DEFAULT_CONFIG, ...saved };
      // One-time migration: the old build shipped a mandatory 15s inter-agent
      // delay. Rate limits are now handled by retrying, so clear the inherited
      // default once. A delay the user sets deliberately after this is kept.
      if (!saved.delayMigrated) {
        if (merged.agentDelay === 15) merged.agentDelay = 0;
        merged.delayMigrated = true;
      }
      return merged;
    } catch { return { ...APP_DEFAULT_CONFIG, delayMigrated: true }; }
  });
  const [configOpen, setConfigOpen] = useState(false);

  // Persist config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cfp-session-eval-council-config", JSON.stringify(config));
  }, [config]);

  // Export the full evaluation report as a Markdown file
  const exportMarkdown = () => {
    const lines = [];
    lines.push(`# CfP Evaluation: ${title || "Untitled Session"}`);
    lines.push("");
    if (abstract) {
      lines.push("## Abstract");
      lines.push(abstract);
      lines.push("");
    }
    lines.push("## Scores");
    lines.push(`- **Acceptance Likelihood:** ${acceptanceScore != null ? acceptanceScore + "%" : "—"}`);
    lines.push(`- **Audience Appeal:** ${audienceScore != null ? audienceScore + "%" : "—"}`);
    lines.push("");
    AGENTS.forEach((a) => {
      if (agentResults[a.id]) {
        lines.push(`## ${a.label}`);
        lines.push(agentResults[a.id]);
        lines.push("");
      }
    });
    if (synthesis) {
      lines.push("## Master Synthesis & Recommendations");
      lines.push(synthesis);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `cfp-evaluation-${(title || "session").toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Prompts the user to paste the CFP text when the analyser agent fails to access the URL. Returns a promise that resolves with the pasted text.
  const waitForCfpText = () =>
    new Promise((resolve) => {
      setNeedsCfpText(true);
      cfpTextResolverRef.current = resolve;
    });

  // Called when the user submits the pasted CFP text. Resolves the waiting promise and continues the evaluation.  
  const submitCfpText = (text) => {
    setNeedsCfpText(false);
    cfpTextResolverRef.current?.(text);
    cfpTextResolverRef.current = null;
  };

  // Pauses for the user to paste past session titles when deterministic
  // retrieval came back empty. Mirrors the CFP paste fallback above.
  const waitForPastTalks = () =>
    new Promise((resolve) => {
      setNeedsPastTalks(true);
      pastTalksResolverRef.current = resolve;
    });

  const submitPastTalks = (text) => {
    setNeedsPastTalks(false);
    pastTalksResolverRef.current?.(text);
    pastTalksResolverRef.current = null;
  };

  // Counts down visibly for `seconds`, showing `label` above the timer.
  // Used for rate-limit backoff waits and, when configured, the optional
  // pre-emptive gap between agents.
  const sleepWithCountdown = async (seconds, label) => {
    const total = Math.ceil(seconds);
    if (total <= 0) return;
    setCountdownTotal(total);
    setCountdownLabel(label);
    for (let i = total; i > 0; i--) {
      setCountdown(i);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCountdown(0);
    setCountdownLabel("");
  };

  // Optional pre-emptive gap between agents. Defaults to 0 — the proxy retries
  // rate-limit errors on its own, so this is only needed on providers with
  // very low request-per-minute ceilings (e.g. the Gemini free tier).
  const interAgentDelay = () =>
    sleepWithCountdown(Number(config.agentDelay) || 0, "NEXT AGENT IN");

  // Wrapper around the callLLM function that automatically includes the current config and allows overriding maxTokens.
  const callLLMWithConfig = (systemPrompt, userMessage, maxTokens = 1000) =>
    callLLM(config, systemPrompt, userMessage, maxTokens);

  // Calls the model, reacting to rate limits instead of pre-empting them.
  // The proxy has already retried internally; if a 429 still surfaces we wait
  // the provider's own suggested delay (falling back to exponential backoff)
  // and try again. Non-rate-limit errors propagate immediately.
  const callWithRetry = async (systemPrompt, userMessage, maxTokens = 1000) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callLLMWithConfig(systemPrompt, userMessage, maxTokens);
      } catch (e) {
        if (!e?.isRateLimit || attempt >= MAX_RATE_LIMIT_RETRIES) throw e;
        // Honour the provider's hint, but never retry instantly — a
        // Retry-After of 0 would otherwise burn all attempts in a tight loop.
        const wait = Math.max(1, e.retryAfter ?? RATE_LIMIT_BACKOFF_SECONDS[attempt]);
        await sleepWithCountdown(wait, "RATE LIMITED — RETRYING IN");
      }
    }
  };

  // Dispatches `agents` concurrently and records each outcome once all have
  // settled. Pass a single agent to run it on its own. Uses allSettled rather
  // than all so that one agent failing never cancels or orphans its peers.
  //
  // A successful result goes into `results` (and so into downstream prompts);
  // a failure is shown on the agent's card but deliberately kept out of
  // `results`, so an error string is never fed to another agent.
  const runAgents = async (agents, results, buildMessage) => {
    setActiveAgents(agents.map((a) => a.id));

    // Each agent's card flips to "Complete" the moment that agent finishes,
    // rather than when the whole wave does.
    const record = (agent, text, errored) => {
      if (errored) {
        delete results[agent.id];
      } else {
        results[agent.id] = text;
      }
      setAgentResults((prev) => ({ ...prev, [agent.id]: text }));
      setAgentProgress((prev) => [...prev, agent.id]);
      setActiveAgents((prev) => prev.filter((id) => id !== agent.id));
    };

    // Every promise carries its own catch, so none of them reject and one
    // agent failing can never cancel or orphan a peer running alongside it.
    await Promise.all(
      agents.map((agent) =>
        // buildMessage may be async (the researcher awaits retrieval first).
        // Resolving it inside each agent's own chain keeps the wave parallel.
        Promise.resolve(buildMessage(agent.id))
          .then((message) => callWithRetry(agent.role, message))
          .then((text) => record(agent, text, false))
          .catch((e) =>
            record(agent, `⚠️ Agent encountered an error: ${e?.message ?? e}`, true),
          ),
      ),
    );
  };

  // Main function to run the full evaluation lifecycle: validates input, iterates through agents with appropriate delays, handles CFP text fallback, and compiles the final synthesis.
  const runEvaluation = async () => {
    if (!title.trim() || !abstract.trim()) {
      setError("Please provide at least a title and abstract.");
      return;
    }
    if (!config.apiKey) {
      setError("No API key configured. Open ⚙ Settings and enter your API key.");
      return;
    }
    setError("");
    setPhase("running");
    setAgentResults({});
    setSynthesis("");
    setAgentProgress([]);

    const buildContext = (extraText) => `
SESSION TITLE: ${title}

ABSTRACT: ${abstract}

EVENT URL: ${eventUrl || "Not provided"}
CALL FOR PAPERS URL: ${cfpUrl || "Not provided"}
${extraText.trim() ? `\nCALL FOR PAPERS TEXT:\n${extraText.trim()}` : ""}
    `.trim();

    let sessionContext = buildContext(cfpText);

    // Successful agent output only. A failed agent is left absent here so its
    // error message is never interpolated into a downstream prompt.
    const results = {};

    // Deterministic programme retrieval and its pasted fallback. Held in
    // locals (not state) because the message builder reads them synchronously
    // during a wave, where a state update would not yet be visible.
    let researchResult = null;
    let pastTalks = "";

    // Reads `sessionContext` at call time, so the CFP-paste fallback's rebuild
    // is picked up by the agents that run after it. Async for the researcher,
    // which fetches the conference programme before it can be prompted; the
    // await happens inside that agent's own chain, so the analyser running
    // alongside it is not held up.
    const buildMessage = async (agentId) => {
      if (agentId !== "researcher") {
        return buildAgentMessage(agentId, sessionContext, results);
      }
      if (researchResult === null) {
        researchResult = await fetchResearch(eventUrl);
        setResearch(researchResult);
      }
      const retrieved = researchBlock({ research: researchResult, pastTalks });
      return buildAgentMessage(agentId, sessionContext, results, retrieved);
    };

    // Wave 1 — the analyser and researcher read nothing but the session
    // context, so they run concurrently. The researcher works from the
    // conference URL and its own knowledge and never reads the CFP text, so
    // it is unaffected by a later CFP-paste fallback rebuilding the context.
    const independent = AGENTS.filter((a) => INDEPENDENT_AGENT_IDS.includes(a.id));
    await runAgents(independent, results, buildMessage);

    // If the analyser couldn't read the CFP URL, pause for a paste and re-run
    // it alone. The researcher's result stands — it never used the CFP text.
    if (results.analyser && analyserCouldNotAccess(results.analyser)) {
      const pastedText = await waitForCfpText();
      sessionContext = buildContext(pastedText);
      // Reset the analyser card to "active" before retrying
      setAgentProgress((prev) => prev.filter((id) => id !== "analyser"));
      const analyser = AGENTS.find((a) => a.id === "analyser");
      await runAgents([analyser], results, buildMessage);
    }

    // Retrieval found nothing usable (JS-rendered programme, bot-block, no
    // event URL). Offer the user a chance to supply real examples, then re-run
    // the researcher with them. Skipping leaves the unverified result as-is.
    if (results.researcher && !researchResult?.ok) {
      const pasted = await waitForPastTalks();
      if (pasted.trim()) {
        pastTalks = pasted;
        setAgentProgress((prev) => prev.filter((id) => id !== "researcher"));
        const researcher = AGENTS.find((a) => a.id === "researcher");
        await runAgents([researcher], results, buildMessage);
      }
    }

    // Wave 2 — each of these depends on wave 1's output, so they stay
    // sequential and are built only after the results above are in.
    for (const agent of AGENTS.filter((a) => !INDEPENDENT_AGENT_IDS.includes(a.id))) {
      await interAgentDelay();
      await runAgents([agent], results, buildMessage);
    }

    await interAgentDelay();
    setActiveAgents(["synthesis"]);

    const truncate = (text, max = 1200) =>
      text && text.length > max ? text.slice(0, max) + "\n[truncated for brevity]" : text;

    const evaluations = [
      ["PROGRAMME COMMITTEE EVALUATION", results.committee],
      ["AUDIENCE MEMBER EVALUATION", results.audience],
    ].filter(([, text]) => text);

    if (evaluations.length === 0) {
      // Both evaluators failed — a synthesis here would be invented, not derived.
      setSynthesis(SYNTHESIS_UNAVAILABLE);
    } else {
      const missing = evaluations.length === 1
        ? "\n\nNOTE: One evaluator agent failed. Base your synthesis only on the evaluation provided above and say so in your answer."
        : "";
      const synthesisInput = `
ORIGINAL SESSION:
${sessionContext}

---
${evaluations.map(([label, text]) => `${label}:\n${truncate(text)}`).join("\n\n---\n")}${missing}
      `.trim();

      try {
        const synth = await callWithRetry(SYNTHESISER_PROMPT, synthesisInput, 4096);
        setSynthesis(synth);
      } catch (e) {
        setSynthesis(`⚠️ Synthesis failed: ${e.message}`);
      }
    }

    setActiveAgents([]);
    setPhase("done");
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // Resets the app to the initial idle state, clearing all inputs and results. Called when the user wants to evaluate a completely new session.
  const reset = () => {
    setPhase("idle");
    setAgentResults({});
    setSynthesis("");
    setAgentProgress([]);
    setActiveAgents([]);
    setError("");
    setCountdown(0);
    setCountdownTotal(0);
    setCountdownLabel("");
    setCfpText("");
    setNeedsCfpText(false);
    cfpTextResolverRef.current = null;
    setResearch(null);
    setNeedsPastTalks(false);
    setPastTalksDraft("");
    pastTalksResolverRef.current = null;
  };

  // Starts the resubmit flow, which allows the user to enter a new title and abstract for the same event. The CFP analysis and conference research are preserved, and only the Committee and Audience agents will re-run.
  const startResubmit = () => {
    setResubmitTitle("");
    setResubmitAbstract("");
    setError("");
    setPhase("resubmit");
  };

  // Runs the evaluation again with the new title and abstract, preserving the analyser and researcher results. Only the Committee and Audience agents will re-run, using the same CFP analysis and conference research.
  const runResubmit = async () => {
    if (!resubmitTitle.trim() || !resubmitAbstract.trim()) {
      setError("Please provide a title and abstract for the new session.");
      return;
    }
    const preservedAnalyser  = agentResults.analyser;
    const preservedResearcher = agentResults.researcher;

    setTitle(resubmitTitle);
    setAbstract(resubmitAbstract);
    setError("");
    setPhase("running");
    setAgentResults({ analyser: preservedAnalyser, researcher: preservedResearcher });
    setSynthesis("");
    setAgentProgress(["analyser", "researcher"]);

    const sessionContext = `
SESSION TITLE: ${resubmitTitle}

ABSTRACT: ${resubmitAbstract}

EVENT URL: ${eventUrl || "Not provided"}
CALL FOR PAPERS URL: ${cfpUrl || "Not provided"}
${cfpText.trim() ? `\nCALL FOR PAPERS TEXT:\n${cfpText.trim()}` : ""}
    `.trim();

    const results = { analyser: preservedAnalyser, researcher: preservedResearcher };

    const buildMessage = (agentId) => buildAgentMessage(agentId, sessionContext, results);

    // Both read only the *preserved* analyser/researcher output, which is
    // already in `results` before either starts — so unlike the first run,
    // here they have no dependency on each other and go out concurrently.
    const evalAgents = AGENTS.filter((a) => a.id === "committee" || a.id === "audience");
    await runAgents(evalAgents, results, buildMessage);

    await interAgentDelay();
    setActiveAgents(["synthesis"]);

    const truncate = (text, max = 1200) =>
      text && text.length > max ? text.slice(0, max) + "\n[truncated for brevity]" : text;

    const evaluations = [
      ["PROGRAMME COMMITTEE EVALUATION", results.committee],
      ["AUDIENCE MEMBER EVALUATION", results.audience],
    ].filter(([, text]) => text);

    if (evaluations.length === 0) {
      setSynthesis(SYNTHESIS_UNAVAILABLE);
    } else {
      const missing = evaluations.length === 1
        ? "\n\nNOTE: One evaluator agent failed. Base your synthesis only on the evaluation provided above and say so in your answer."
        : "";
      const synthesisInput = `
ORIGINAL SESSION:
${sessionContext}

---
${evaluations.map(([label, text]) => `${label}:\n${truncate(text)}`).join("\n\n---\n")}${missing}
      `.trim();

      try {
        const synth = await callWithRetry(SYNTHESISER_PROMPT, synthesisInput, 4096);
        setSynthesis(synth);
      } catch (e) {
        setSynthesis(`⚠️ Synthesis failed: ${e.message}`);
      }
    }

    setActiveAgents([]);
    setPhase("done");
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const acceptanceScore = extractScore(synthesis, "Acceptance Likelihood");
  const audienceScore = extractScore(synthesis, "Audience Appeal");

  // Main render function with conditional views for each phase of the app lifecycle. Includes the header, form inputs, agent progress indicators, and results display.
  return (
    <div className="app-root">
      {/* ── Header ── */}
      <div className="app-header">
        <div className="header-logo">✏️</div>
        <div>
          <div className="header-brand-name">CFP SESSION EVALUATOR COUNCIL</div>
          <div className="header-brand-sub">MULTI-AGENT CONFERENCE CFP (CALL FOR PAPERS) SESSION EVALUATOR</div>
        </div>
        <div className="header-right">
          <div className="agent-dots">
            {AGENTS.map((a) => (
              <div key={a.id} className="agent-dot" style={{
                background: agentProgress.includes(a.id) || activeAgents.includes(a.id) ? a.color : "#1E2030",
                boxShadow: activeAgents.includes(a.id) ? `0 0 8px ${a.color}` : "none",
              }} />
            ))}
          </div>
          <button onClick={() => setConfigOpen(true)} title="Settings" className="config-btn"
            style={{
              background: config.apiKey ? "#111320" : "#2D1A0E",
              border: config.apiKey ? "1px solid #1E2030" : "1px solid #F59E0B88",
              boxShadow: config.apiKey ? "none" : "0 0 10px #F59E0B44",
            }}
          >
            <GearIcon color={config.apiKey ? "#6B7280" : "#F59E0B"} />
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* ── Idle / Form ── */}
        {phase === "idle" && (
          <div className="idle-view">
            <div className="idle-header">
              <h1 className="idle-title">
                Will your session get accepted?
              </h1>
              <p className="idle-subtitle">
                You have something worth sharing. Conference organisers put real effort into curating sessions that serve their community. <strong>They deserve submissions that are clear, relevant, and well-argued.</strong> This tool helps you stress-test your abstract before you submit it. Not to game the process, but to make sure your idea comes across the way you intend it to.Your abstract is put in front of four AI agents, each reading it from a different angle: the person who wrote the call for papers, someone who knows the conference inside out, a programme committee reviewer, and a typical attendee. A fifth agent, the Synthesiser, reads all their outputs and gives you a consolidated report with rewrite suggestions.
              </p>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="form-grid">
              <Field label="SESSION TITLE *">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. From Zero to Hero: Network Automation with Python in 45 Minutes"
                  className="input"
                />
              </Field>

              <Field label="ABSTRACT *">
                <textarea
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  placeholder="Paste your session abstract here..."
                  rows={6}
                  className="input input--textarea"
                />
              </Field>

              <div className="form-row-2col">
                <Field label="EVENT URL" hint="Conference homepage">
                  <input
                    value={eventUrl}
                    onChange={(e) => setEventUrl(e.target.value)}
                    placeholder="https://ciscolive.com"
                    className="input"
                  />
                </Field>
                <Field label="CALL FOR PAPERS URL" hint="CFP page or PDF">
                  <input
                    value={cfpUrl}
                    onChange={(e) => setCfpUrl(e.target.value)}
                    placeholder="https://event.com/cfp"
                    className="input"
                  />
                </Field>
              </div>

              <div className="agents-section">
                <div className="section-label">ACTIVE AGENTS</div>
                <div className="agents-grid">
                  {AGENTS.map((a) => (
                    <div key={a.id} className="agent-card-idle"
                      style={{ border: `1px solid ${a.color}22` }}>
                      <span className="agent-card-idle-icon">{a.icon}</span>
                      <div>
                        <div className="agent-card-idle-name" style={{ color: a.color }}>{a.label}</div>
                        <div className="agent-card-idle-desc">{a.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={runEvaluation} className="submit-btn">
                ⚡ RUN EVALUATION
              </button>
            </div>
          </div>
        )}

        {/* ── Running ── */}
        {phase === "running" && (
          <div>
            <div className="running-header">
              <div className="running-status-label">EVALUATION IN PROGRESS</div>
              <div className="running-status-title">
                {countdown > 0
                  ? countdownLabel?.startsWith("RATE LIMITED")
                    ? "Rate limited by the provider — waiting to retry..."
                    : "Cooling down between agents..."
                  : activeAgents.includes("synthesis")
                  ? "Synthesising all agent reports..."
                  : activeAgents.length > 0
                  ? runningLabel(activeAgents)
                  : "Preparing agents..."}
              </div>
              {countdown > 0 && (
                <div className="countdown-wrapper">
                  <div className="countdown-label">{countdownLabel}</div>
                  <div className="countdown-number"
                    style={{ color: countdown <= 5 ? "#34D399" : "#F59E0B" }}>
                    {countdown}s
                  </div>
                  <div className="countdown-bar-track">
                    <div className="countdown-bar-fill"
                      style={{ width: `${countdownTotal > 0 ? ((countdownTotal - countdown) / countdownTotal) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* CFP text fallback */}
            {needsCfpText && (
              <div className="cfp-fallback">
                <div className="cfp-fallback-header">
                  <span className="cfp-fallback-icon">📋</span>
                  <div>
                    <div className="cfp-fallback-title">CFP ANALYSER COULDN'T ACCESS THE URL</div>
                    <div className="cfp-fallback-subtitle">
                      Paste the Call for Papers text below and the remaining agents will use it directly.
                    </div>
                  </div>
                </div>
                <textarea
                  id="cfp-text-input"
                  value={cfpText}
                  onChange={(e) => setCfpText(e.target.value)}
                  placeholder="Paste the full Call for Papers text here..."
                  rows={7}
                  className="input input--textarea"
                  style={{ marginBottom: 12 }}
                />
                <div className="cfp-fallback-actions">
                  <button onClick={() => submitCfpText(cfpText)} className="btn-continue">
                    ▶ CONTINUE WITH REMAINING AGENTS
                  </button>
                  <button onClick={() => submitCfpText("")} className="btn-skip">
                    Skip
                  </button>
                </div>
              </div>
            )}

            {/* Past-talks fallback: deterministic retrieval found nothing usable */}
            {needsPastTalks && (
              <div className="cfp-fallback">
                <div className="cfp-fallback-header">
                  <span className="cfp-fallback-icon">📚</span>
                  <div>
                    <div className="cfp-fallback-title">COULDN'T READ THIS CONFERENCE'S PAST PROGRAMME</div>
                    <div className="cfp-fallback-subtitle">
                      {research?.reason
                        ? `Tried fetching the programme pages, but ${research.reason}.`
                        : "The programme pages could not be read."}{" "}
                      Paste a few past session titles and the Conference Researcher will use them
                      as real evidence. Skip and it will fall back on training memory, clearly
                      marked as unverified.
                    </div>
                  </div>
                </div>
                <textarea
                  id="past-talks-input"
                  value={pastTalksDraft}
                  onChange={(e) => setPastTalksDraft(e.target.value)}
                  placeholder={"One session title per line, e.g.\n14 Years of systemd\nWhat FLOSS Means in the AI World"}
                  rows={7}
                  className="input input--textarea"
                  style={{ marginBottom: 12 }}
                />
                <div className="cfp-fallback-actions">
                  <button onClick={() => submitPastTalks(pastTalksDraft)} className="btn-continue">
                    ▶ USE THESE EXAMPLES
                  </button>
                  <button onClick={() => submitPastTalks("")} className="btn-skip">
                    Skip
                  </button>
                </div>
              </div>
            )}

            <div className="agent-list">
              {AGENTS.map((a) => {
                const isDone   = agentProgress.includes(a.id);
                const isActive = activeAgents.includes(a.id);
                return (
                  <div key={a.id} className="agent-progress-card" style={{
                    border: `1px solid ${isDone ? a.color + "55" : isActive ? a.color : "#1E2030"}`,
                    boxShadow: isActive ? `0 0 20px ${a.color}22` : "none",
                  }}>
                    <div className="agent-progress-row"
                      style={{ marginBottom: isDone && agentResults[a.id] ? 12 : 0 }}>
                      <span className="agent-progress-icon">{a.icon}</span>
                      <div className="agent-progress-info">
                        <div className="agent-progress-name"
                          style={{ color: isDone ? a.color : isActive ? a.color : "#4B5563" }}>
                          {a.label}
                        </div>
                        <div className="agent-progress-desc">
                          {isActive ? a.desc : isDone ? "Complete" : "Waiting..."}
                        </div>
                      </div>
                      <div className="agent-progress-status" style={{
                        background:  isDone ? a.color : "transparent",
                        border:      isDone ? "none" : isActive ? `2px solid ${a.color}` : "2px solid #1E2030",
                        animation:   isActive ? "spin 1s linear infinite" : "none",
                      }}>
                        {isDone ? "✓" : isActive ? "◌" : ""}
                      </div>
                    </div>
                    {isDone && agentResults[a.id] && (
                      <div className="agent-progress-preview"
                        style={{ borderTop: `1px solid ${a.color}22` }}>
                        {agentResults[a.id]}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Synthesis indicator */}
              <div className="synthesis-card" style={{
                border: `1px solid ${activeAgents.includes("synthesis") ? "#F59E0B" : "#1E2030"}`,
                boxShadow: activeAgents.includes("synthesis") ? "0 0 20px #F59E0B22" : "none",
              }}>
                <div className="synthesis-card-inner">
                  <span className="synthesis-icon">🧠</span>
                  <div>
                    <div className="synthesis-title"
                      style={{ color: activeAgents.includes("synthesis") ? "#F59E0B" : "#4B5563" }}>
                      Master Synthesiser
                    </div>
                    <div className="synthesis-desc">
                      {activeAgents.includes("synthesis")
                        ? "Compiling final report and rewrite suggestions..."
                        : "Waiting for all agents..."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Done / Results ── */}
        {phase === "done" && (
          <div ref={resultsRef}>
            <div className="scores-grid">
              <ScoreCard label="ACCEPTANCE LIKELIHOOD" score={acceptanceScore} color="#34D399" icon="🎯" />
              <ScoreCard label="AUDIENCE APPEAL"        score={audienceScore}   color="#FB923C" icon="🙋" />
            </div>

            <div className="agent-reports-section">
              <div className="agent-reports-label">AGENT REPORTS</div>
              <div className="agent-reports-list">
                {AGENTS.map((a) => (
                  <AgentReport key={a.id} agent={a} content={agentResults[a.id]} />
                ))}
              </div>
            </div>

            {synthesis && (
              <div className="synthesis-output">
                <div className="synthesis-output-header">
                  <span className="synthesis-output-icon">🧠</span>
                  <div>
                    <div className="synthesis-output-title">MASTER SYNTHESIS &amp; RECOMMENDATIONS</div>
                    <div className="synthesis-output-sub">Compiled from all four agent analyses</div>
                  </div>
                </div>
                <div className="synthesis-output-content md-content">
                  <ReactMarkdown>{synthesis}</ReactMarkdown>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={reset} className="btn-reset">
                ← EVALUATE ANOTHER SESSION
              </button>
              <button onClick={startResubmit} className="btn-resubmit">
                ↩ TRY ANOTHER SESSION FOR THIS EVENT
              </button>
              <button onClick={exportMarkdown} className="btn-export">
                ↓ EXPORT AS .MD
              </button>
            </div>
          </div>
        )}

        {/* ── Resubmit ── */}
        {phase === "resubmit" && (
          <div className="idle-view">
            <div className="idle-header">
              <h1 className="idle-title">Try another session for this event</h1>
              <p className="idle-subtitle">
                The CFP analysis and conference research are reused. Enter a new title and abstract — only the Committee and Audience agents will re-run.
              </p>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="form-grid">
              <Field label="SESSION TITLE *">
                <input
                  value={resubmitTitle}
                  onChange={(e) => setResubmitTitle(e.target.value)}
                  placeholder="e.g. From Zero to Hero: Network Automation with Python in 45 Minutes"
                  className="input"
                />
              </Field>

              <Field label="ABSTRACT *">
                <textarea
                  value={resubmitAbstract}
                  onChange={(e) => setResubmitAbstract(e.target.value)}
                  placeholder="Paste your session abstract here..."
                  rows={6}
                  className="input input--textarea"
                />
              </Field>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button onClick={runResubmit} className="submit-btn">
                  ⚡ RE-EVALUATE WITH NEW SESSION
                </button>
                <button onClick={() => setPhase("done")} className="btn-reset">
                  ← BACK TO RESULTS
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {configOpen && (
        <ConfigPanel
          config={config}
          onSave={(next) => { setConfig(next); setConfigOpen(false); }}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
