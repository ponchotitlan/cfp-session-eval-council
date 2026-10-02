// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Displays a single percentage score with a label and a progress bar. The
 * big value stays flat ink-black; the label and bar carry a colour-coded
 * accent that shifts green → amber → red based on the score threshold
 * (≥70 / ≥50 / <50).
 *
 * @param {string}      label  - Score category name (e.g. "ACCEPTANCE LIKELIHOOD").
 * @param {number|null} score  - Numeric score (0–100), or null when not yet available.
 * @param {string}      color  - Accent colour used for the label/bar on a high score.
 * @param {string}      icon   - Emoji icon displayed above the score.
 */
export default function ScoreCard({ label, score, color, icon }) {
  const accentColor = score >= 70 ? color : score >= 50 ? "var(--color-warning)" : "var(--color-error)";
  return (
    <div className="score-card">
      <div className="score-card-icon">{icon}</div>
      <div className="score-card-label" style={{ color: accentColor }}>{label}</div>
      <div className="score-card-value">
        {score != null ? `${score}%` : "—"}
      </div>
      <div className="score-card-bar-track">
        <div className="score-card-bar-fill" style={{
          width: score != null ? `${score}%` : "0%",
          background: accentColor,
        }} />
      </div>
    </div>
  );
}
