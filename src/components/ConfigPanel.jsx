// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { PROVIDERS, MODELS, DEFAULT_MODELS } from "../config/models";

const MIN_DELAY_SECONDS = 0;

const GEAR_PATH = "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z";

export function GearIcon({ size = 16, color = "var(--text-gray)", className = "gear-icon" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d={GEAR_PATH} />
    </svg>
  );
}

/**
 * Modal settings panel for configuring the LLM provider, per-provider API keys,
 * model selection, and the optional inter-agent delay.
 *
 * Edits are kept in a local draft state until the user clicks "SAVE SETTINGS",
 * at which point the validated config is passed to the parent via `onSave`.
 *
 * @param {{ provider: string, apiKey: string, apiKeys: Object, model: string, agentDelay: number }} config - Current saved configuration.
 * @param {function(Object): void} onSave  - Called with the new config object when the user saves.
 * @param {function(): void}       onClose - Called when the modal should be dismissed without saving.
 */
export default function ConfigPanel({ config, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    provider: "anthropic",
    // Per-provider API keys stored under apiKeys map; fall back to legacy apiKey
    apiKeys: {
      anthropic: config.provider === "anthropic" || !config.provider ? config.apiKey || "" : "",
      openai:    config.provider === "openai"    ? config.apiKey || "" : "",
      gemini:    config.provider === "gemini"    ? config.apiKey || "" : "",
      ...(config.apiKeys || {}),
    },
    model: config.model || DEFAULT_MODELS[config.provider || "anthropic"],
    agentDelay: config.agentDelay ?? 0,
    ...config,
  }));
  const [showKey, setShowKey] = useState(false);
  const [delayError, setDelayError] = useState("");
  const [showDelayTip, setShowDelayTip] = useState(false);

  const activeProvider = PROVIDERS.find((p) => p.id === draft.provider) || PROVIDERS[0];
  const providerModels = MODELS[draft.provider] || [];

  const delayTipText = "Agents run one at a time, and rate-limit errors are retried automatically using the delay the provider asks for. Leave this at 0 unless your provider has a very low requests-per-minute ceiling (for example the Gemini free tier), in which case 10-15s adds headroom at the cost of a slower run.";

  const handleProviderChange = (providerId) => {
    setDraft((prev) => ({
      ...prev,
      provider: providerId,
      model: DEFAULT_MODELS[providerId],
    }));
  };

  const handleSave = () => {
    const d = parseInt(draft.agentDelay, 10);
    if (isNaN(d) || d < MIN_DELAY_SECONDS) {
      setDelayError(`Must be ${MIN_DELAY_SECONDS} seconds or more.`);
      return;
    }
    const currentApiKey = (draft.apiKeys || {})[draft.provider] || "";
    onSave({
      provider: draft.provider,
      apiKey: currentApiKey,
      apiKeys: draft.apiKeys,
      model: draft.model,
      agentDelay: d,
      // Preserve the migration flag so a deliberately-chosen delay is not
      // reset to 0 the next time the app loads.
      delayMigrated: true,
    });
  };

  return (
    <div className="config-overlay" onClick={onClose}>
      <div className="config-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="config-modal-header">
          <GearIcon size={20} color="var(--cisco-primary)" />
          <div style={{ flex: 1 }}>
            <div className="config-modal-title">SETTINGS</div>
            <div className="config-modal-sub">Stored locally in your browser</div>
          </div>
          <button onClick={onClose} className="config-modal-close">×</button>
        </div>

        <div className="config-fields">
          {/* Provider selector */}
          <div>
            <label className="config-label">LLM PROVIDER</label>
            <div className="provider-tabs">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className="provider-tab"
                  style={{
                    background: draft.provider === p.id ? "rgba(77, 163, 232, 0.13)" : "transparent",
                    border: draft.provider === p.id ? "1px solid var(--cisco-primary)" : "1px solid var(--border-main)",
                    color: draft.provider === p.id ? "var(--cisco-primary)" : "var(--text-gray)",
                  }}
                >
                  <span>{p.icon}</span> {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key for active provider */}
          <div>
            <label className="config-label">{activeProvider.label.toUpperCase()} API KEY</label>
            <div className="api-key-wrap">
              <input
                type={showKey ? "text" : "password"}
                value={(draft.apiKeys || {})[draft.provider] || ""}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    apiKeys: { ...prev.apiKeys, [prev.provider]: e.target.value },
                  }))
                }
                placeholder={activeProvider.keyHint}
                className="config-input config-input--with-btn"
                style={{
                  fontFamily: showKey ? "Arial, sans-serif, apple-system" : "monospace",
                  letterSpacing: showKey ? "normal" : "0.1em",
                }}
              />
              <button onClick={() => setShowKey(!showKey)}
                title={showKey ? "Hide key" : "Reveal key"}
                className="api-key-reveal">
                {showKey ? "🙈" : "👁"}
              </button>
            </div>
            <div className="api-key-hint">
              Get yours at{" "}
              <a href={activeProvider.keysUrl} target="_blank" rel="noreferrer">
                {activeProvider.keysUrl.replace(/^https?:\/\//, "").split("/")[0]}
              </a>. Never leaves your device.
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="config-label">MODEL</label>
            <select
              value={draft.model}
              onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
              className="config-input"
              style={{ cursor: "pointer" }}
            >
              {providerModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
              ))}
            </select>
          </div>

          {/* Agent delay */}
          <div>
            <div className="delay-label-row">
              <label className="config-label" style={{ margin: 0 }}>
                EXTRA DELAY BETWEEN AGENTS (seconds)
              </label>
              <span
                onMouseEnter={() => setShowDelayTip(true)}
                onMouseLeave={() => setShowDelayTip(false)}
                onClick={() => setShowDelayTip((v) => !v)}
                className="info-btn"
                style={{
                  background: showDelayTip ? "var(--cisco-primary)" : "var(--border-main)",
                  color:      showDelayTip ? "var(--bg-page)" : "var(--text-gray)",
                }}
              >
                i
                {showDelayTip && (
                  <div className="info-tooltip">
                    <div className="info-tooltip-title">DO I NEED THIS?</div>
                    {delayTipText}
                    <div className="info-tooltip-arrow" />
                  </div>
                )}
              </span>
            </div>
            <div className="delay-input-row">
              <input
                type="number"
                min={MIN_DELAY_SECONDS}
                value={draft.agentDelay}
                onChange={(e) => { setDraft((prev) => ({ ...prev, agentDelay: e.target.value })); setDelayError(""); }}
                className="config-input"
                style={{ width: 100 }}
              />
              <span className="delay-hint">0 = off · raise only if rate limited</span>
            </div>
            {delayError && <div className="delay-error">{delayError}</div>}
          </div>
        </div>

        {/* Actions */}
        <div className="config-actions">
          <button onClick={handleSave} className="btn-save">SAVE SETTINGS</button>
          <button onClick={onClose}    className="btn-cancel">Cancel</button>
        </div>
      </div>
    </div>
  );
}
