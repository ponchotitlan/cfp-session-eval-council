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

// CSS styles
import "./App.css";

// App components
import ConfigPanel, { GearIcon } from "./components/ConfigPanel";
import Field from "./components/Field";
import ScoreCard from "./components/ScoreCard";
import AgentReport from "./components/AgentReport";

const APP_DEFAULT_CONFIG = { ...DEFAULT_CONFIG, model: DEFAULT_MODELS.anthropic };

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
  const [phase, setPhase] = useState("idle"); // idle | running | done | resubmit
  const [agentResults, setAgentResults] = useState({});
  const [synthesis, setSynthesis] = useState("");
  const [activeAgent, setActiveAgent] = useState(null);
  const [agentProgress, setAgentProgress] = useState([]);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [resubmitTitle, setResubmitTitle] = useState("");
  const [resubmitAbstract, setResubmitAbstract] = useState("");
  const resultsRef = useRef(null);
  const cfpTextResolverRef = useRef(null);

  // Load config from localStorage or use defaults
  const [config, setConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cfp-session-eval-council-config") || "{}");
      return { ...APP_DEFAULT_CONFIG, ...saved };
    } catch { return APP_DEFAULT_CONFIG; }
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

  // Utility function to create a countdown timer for rate-limiting between agent calls. Updates the `countdown` state every second and resolves after the specified time.
  const sleepWithCountdown = async (ms) => {
    const seconds = Math.ceil(ms / 1000);
    for (let i = seconds; i > 0; i--) {
      setCountdown(i);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCountdown(0);
  };

  // Wrapper around the callLLM function that automatically includes the current config and allows overriding maxTokens.
  const callLLMWithConfig = (systemPrompt, userMessage, maxTokens = 1000) =>
    callLLM(config, systemPrompt, userMessage, maxTokens);

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

    const results = {};

    const buildAgentMessage = (agentId) => {
      if (agentId === "committee") {
        return `${sessionContext}\n\n---\nCONFERENCE ANALYSIS:\n${results.researcher}\n\n---\nCFP ANALYSIS:\n${results.analyser}`;
      }
      if (agentId === "audience") {
        return `${sessionContext}\n\n---\nCONFERENCE ANALYSIS:\n${results.researcher}`;
      }
      return sessionContext;
    };

    for (const [index, agent] of AGENTS.entries()) {
      if (index > 0) await sleepWithCountdown(config.agentDelay * 1000);
      setActiveAgent(agent.id);
      try {
        const result = await callLLMWithConfig(agent.role, buildAgentMessage(agent.id));
        results[agent.id] = result;
        setAgentResults((prev) => ({ ...prev, [agent.id]: result }));
        setAgentProgress((prev) => [...prev, agent.id]);

        // After analyser: if it couldn't read the CFP URL, pause and ask user to paste the text
        if (agent.id === "analyser" && analyserCouldNotAccess(result)) {
          const pastedText = await waitForCfpText();
          // Rebuild context with the pasted text and re-run the analyser
          sessionContext = buildContext(pastedText);
          // Reset analyser card to "active" state before retrying
          setAgentProgress((prev) => prev.filter((id) => id !== "analyser"));
          setActiveAgent("analyser");
          await sleepWithCountdown(config.agentDelay * 1000); // respect rate limit before retry
          const retryResult = await callLLMWithConfig(agent.role, buildAgentMessage(agent.id));
          results[agent.id] = retryResult;
          setAgentResults((prev) => ({ ...prev, [agent.id]: retryResult }));
          setAgentProgress((prev) => [...prev, "analyser"]);
        }
      } catch (e) {
        results[agent.id] = `⚠️ Agent encountered an error: ${e.message}`;
        setAgentResults((prev) => ({ ...prev, [agent.id]: results[agent.id] }));
        setAgentProgress((prev) => [...prev, agent.id]);
      }
    }

    await sleepWithCountdown(config.agentDelay * 1000); // extra gap before synthesis (largest input call)
    setActiveAgent("synthesis");
    const truncate = (text, max = 1200) =>
      text && text.length > max ? text.slice(0, max) + "\n[truncated for brevity]" : text;
    const synthesisInput = `
ORIGINAL SESSION:
${sessionContext}

---
PROGRAMME COMMITTEE EVALUATION:
${truncate(results.committee)}

---
AUDIENCE MEMBER EVALUATION:
${truncate(results.audience)}
    `.trim();

    try {
      const synth = await callLLMWithConfig(SYNTHESISER_PROMPT, synthesisInput, 4096);
      setSynthesis(synth);
    } catch (e) {
      setSynthesis(`⚠️ Synthesis failed: ${e.message}`);
    }

    setActiveAgent(null);
    setPhase("done");
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // Resets the app to the initial idle state, clearing all inputs and results. Called when the user wants to evaluate a completely new session.
  const reset = () => {
    setPhase("idle");
    setAgentResults({});
    setSynthesis("");
    setAgentProgress([]);
    setActiveAgent(null);
    setError("");
    setCfpText("");
    setNeedsCfpText(false);
    cfpTextResolverRef.current = null;
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

    const buildMsg = (agentId) => {
      if (agentId === "committee") {
        return `${sessionContext}\n\n---\nCONFERENCE ANALYSIS:\n${results.researcher}\n\n---\nCFP ANALYSIS:\n${results.analyser}`;
      }
      if (agentId === "audience") {
        return `${sessionContext}\n\n---\nCONFERENCE OVERVIEW:\n${results.analyser}`;
      }
      return sessionContext;
    };

    const evalAgents = AGENTS.filter((a) => a.id === "committee" || a.id === "audience");
    for (const [index, agent] of evalAgents.entries()) {
      if (index > 0) await sleepWithCountdown(config.agentDelay * 1000);
      setActiveAgent(agent.id);
      try {
        const result = await callLLMWithConfig(agent.role, buildMsg(agent.id));
        results[agent.id] = result;
        setAgentResults((prev) => ({ ...prev, [agent.id]: result }));
        setAgentProgress((prev) => [...prev, agent.id]);
      } catch (e) {
        results[agent.id] = `⚠️ Agent encountered an error: ${e.message}`;
        setAgentResults((prev) => ({ ...prev, [agent.id]: results[agent.id] }));
        setAgentProgress((prev) => [...prev, agent.id]);
      }
    }

    await sleepWithCountdown(config.agentDelay * 1000);
    setActiveAgent("synthesis");
    const truncate = (text, max = 1200) =>
      text && text.length > max ? text.slice(0, max) + "\n[truncated for brevity]" : text;
    const synthesisInput = `
ORIGINAL SESSION:
${sessionContext}

---
PROGRAMME COMMITTEE EVALUATION:
${truncate(results.committee)}

---
AUDIENCE MEMBER EVALUATION:
${truncate(results.audience)}
    `.trim();

    try {
      const synth = await callLLMWithConfig(SYNTHESISER_PROMPT, synthesisInput, 4096);
      setSynthesis(synth);
    } catch (e) {
      setSynthesis(`⚠️ Synthesis failed: ${e.message}`);
    }

    setActiveAgent(null);
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
                background: agentProgress.includes(a.id) || activeAgent === a.id ? a.color : "#1E2030",
                boxShadow: activeAgent === a.id ? `0 0 8px ${a.color}` : "none",
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
                Let's present your session to the council
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
                  ? "Cooling down between agents..."
                  : activeAgent === "synthesis"
                  ? "Synthesising all agent reports..."
                  : activeAgent
                  ? `${AGENTS.find((a) => a.id === activeAgent)?.icon} ${AGENTS.find((a) => a.id === activeAgent)?.label} is analysing...`
                  : "Preparing agents..."}
              </div>
              {countdown > 0 && (
                <div className="countdown-wrapper">
                  <div className="countdown-label">RATE LIMIT PAUSE — NEXT AGENT IN</div>
                  <div className="countdown-number"
                    style={{ color: countdown <= 5 ? "#34D399" : "#F59E0B" }}>
                    {countdown}s
                  </div>
                  <div className="countdown-bar-track">
                    <div className="countdown-bar-fill"
                      style={{ width: `${((15 - countdown) / 15) * 100}%` }} />
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

            <div className="agent-list">
              {AGENTS.map((a) => {
                const isDone   = agentProgress.includes(a.id);
                const isActive = activeAgent === a.id;
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
                border: `1px solid ${activeAgent === "synthesis" ? "#F59E0B" : "#1E2030"}`,
                boxShadow: activeAgent === "synthesis" ? "0 0 20px #F59E0B22" : "none",
              }}>
                <div className="synthesis-card-inner">
                  <span className="synthesis-icon">🧠</span>
                  <div>
                    <div className="synthesis-title"
                      style={{ color: activeAgent === "synthesis" ? "#F59E0B" : "#4B5563" }}>
                      Master Synthesiser
                    </div>
                    <div className="synthesis-desc">
                      {activeAgent === "synthesis"
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
