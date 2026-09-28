// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Displays a single percentage score with a label, colour-coded value, and a
 * progress bar. The value colour shifts from green → amber → red based on the
 * score threshold (≥70 / ≥50 / <50).
 *
 * @param {string}      label  - Score category name (e.g. "ACCEPTANCE LIKELIHOOD").
 * @param {number|null} score  - Numeric score (0–100), or null when not yet available.
 * @param {string}      color  - Primary accent colour used for the bar and high-score text.
 * @param {string}      icon   - Emoji icon displayed above the score.
 */
export default function ScoreCard({ label, score, color, icon }) {
  const valueColor = score >= 70 ? color : score >= 50 ? "var(--color-warning)" : "var(--color-error)";
  return (
    <div className="score-card" style={{ border: `1px solid ${color}44` }}>
      <div className="score-card-icon">{icon}</div>
      <div className="score-card-label">{label}</div>
      <div className="score-card-value" style={{ color: valueColor }}>
        {score != null ? `${score}%` : "—"}
      </div>
      <div className="score-card-bar-track">
        <div className="score-card-bar-fill" style={{
          width: score != null ? `${score}%` : "0%",
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
        }} />
      </div>
    </div>
  );
}
