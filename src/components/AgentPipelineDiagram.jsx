// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import { AGENTS } from "../config/agents";

// Short, diagram-sized description of what each agent does — distinct from
// the longer prose used elsewhere (progress list, running-phase captions).
const AGENT_BLURBS = {
  analyser: "Reads the call for papers and pulls out what reviewers actually require.",
  researcher: "Studies past sessions to learn what this conference tends to accept.",
  committee: "Scores your submission the way a reviewer would.",
  audience: "Judges whether the session would be worth attending.",
};

const SYNTHESISER = {
  id: "synthesiser",
  label: "Master Synthesiser",
  icon: "🧠",
  color: "#A8710F",
  blurb: "Combines both verdicts into one report with rewrite suggestions.",
};

const FEEDBACK_TITLE = "Pauses and asks you directly if it can't reach this on its own.";

// The two endpoints of the pipeline — not agents, so they get a neutral
// ink tint rather than one of the agent colors.
const ENDPOINT_COLOR = "#707273"; // matches --text-gray
const ABSTRACT_NODE = { icon: "📝", color: ENDPOINT_COLOR };
const REPORT_NODE = { icon: "📄", color: ENDPOINT_COLOR };

// Gentle S-curve between two points — the default connector language.
const sCurveH = (x1, y1, x2, y2) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`;
};
const sCurveV = (x1, y1, x2, y2) => {
  const my = (y1 + y2) / 2;
  return `M ${x1},${y1} C ${x1},${my} ${x2},${my} ${x2},${y2}`;
};

// Vertical connector that pinches through a fixed central gutter for most of
// its travel, so it clears the two side-by-side label columns it has to
// cross, only diverging to x1/x2 right at the node ends.
const pinchCurveV = (x1, y1, x2, y2, pinchX) => {
  const y1b = y1 + (y2 - y1) * 0.18;
  const y2b = y1 + (y2 - y1) * 0.82;
  return `M ${x1},${y1} C ${pinchX},${y1b} ${pinchX},${y2b} ${x2},${y2}`;
};

// Small badge sitting on the node's own edge (not floating in free space
// above it, which risks colliding with whatever sits there) representing
// the human-in-the-loop fallback both wave-1 agents have.
const FeedbackBadge = ({ cx, cy, r }) => {
  const bx = cx + r * 0.7;
  const by = cy - r * 0.7;
  return (
    <g>
      <title>{FEEDBACK_TITLE}</title>
      <circle cx={bx} cy={by} r="11" fill="var(--bg-white)" stroke="var(--text-light-gray)" strokeWidth="1.5" strokeDasharray="2 2" />
      <text x={bx} y={by + 4} textAnchor="middle" fontSize="11">👤</text>
    </g>
  );
};

const Node = ({ x, y, r, agent, big }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={`${agent.color}14`} stroke={agent.color} strokeWidth="2" />
    <text x={x} y={y + (big ? 7 : 6)} textAnchor="middle" fontSize={big ? 26 : 22}>{agent.icon}</text>
  </g>
);

const NodeLabel = ({ x, y, width, height = 90, agent, blurb }) => (
  <foreignObject x={x - width / 2} y={y} width={width} height={height}>
    <div xmlns="http://www.w3.org/1999/xhtml" className="pipeline-label">
      <div className="pipeline-label-name" style={{ color: agent.color }}>{agent.label}</div>
      <div className="pipeline-label-blurb">{blurb}</div>
    </div>
  </foreignObject>
);

const ArrowDefs = () => {
  const colors = [...AGENTS.map((a) => a.color), SYNTHESISER.color];
  return (
    <defs>
      {colors.map((c) => (
        <marker key={c} id={`arrow-${c}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={c} />
        </marker>
      ))}
    </defs>
  );
};

const Edge = ({ d, color }) => (
  <path d={d} fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="2" markerEnd={`url(#arrow-${color})`} />
);

/**
 * Diagram showing the five agents that evaluate a submission: what each one
 * does, the order they run in, and how their outputs feed one another.
 * Two hand-tuned layouts (wide horizontal pipeline / narrow vertical stack)
 * are both rendered and toggled by CSS media query, so the diagram never
 * has to reflow or recompute at an arbitrary width — each is its own fixed
 * SVG viewBox that simply scales with its container.
 */
export default function AgentPipelineDiagram() {
  const [analyser, researcher, committee, audience] = AGENTS;

  return (
    <div className="pipeline-diagram" role="img"
      aria-label="Diagram: your submission goes to the CFP Analyser and Conference Researcher at the same time. Their findings feed the Programme Committee Member and Audience Member, who each score the submission. Both scores are combined by the Master Synthesiser into your final report.">

      {/* ── Wide layout ── */}
      <svg className="pipeline-svg pipeline-svg--wide" viewBox="0 0 1040 460" preserveAspectRatio="xMidYMid meet">
        <ArrowDefs />

        <Edge d={sCurveH(92, 198, 218, 100)} color={analyser.color} />
        <Edge d={sCurveH(92, 198, 218, 295)} color={researcher.color} />

        <Edge d={sCurveH(302, 100, 518, 100)} color={analyser.color} />
        <Edge d={sCurveH(302, 295, 518, 100)} color={researcher.color} />
        <Edge d={sCurveH(302, 295, 518, 295)} color={researcher.color} />

        <Edge d={sCurveH(602, 100, 772, 198)} color={committee.color} />
        <Edge d={sCurveH(602, 295, 772, 198)} color={audience.color} />

        <Edge d={sCurveH(868, 198, 948, 198)} color={SYNTHESISER.color} />

        <Node x={60} y={198} r={32} agent={ABSTRACT_NODE} />
        <text x="60" y="252" textAnchor="middle" fontSize="12" fontWeight="600" letterSpacing="0.06em" fill="var(--text-gray)">YOUR ABSTRACT</text>

        <Node x={260} y={100} r={42} agent={analyser} />
        <FeedbackBadge cx={260} cy={100} r={42} />
        <NodeLabel x={260} y={148} width={176} agent={analyser} blurb={AGENT_BLURBS.analyser} />

        <Node x={260} y={295} r={42} agent={researcher} />
        <FeedbackBadge cx={260} cy={295} r={42} />
        <NodeLabel x={260} y={343} width={176} agent={researcher} blurb={AGENT_BLURBS.researcher} />

        <Node x={560} y={100} r={42} agent={committee} />
        <NodeLabel x={560} y={148} width={176} agent={committee} blurb={AGENT_BLURBS.committee} />

        <Node x={560} y={295} r={42} agent={audience} />
        <NodeLabel x={560} y={343} width={176} agent={audience} blurb={AGENT_BLURBS.audience} />

        <Node x={820} y={198} r={48} agent={SYNTHESISER} big />
        <NodeLabel x={820} y={252} width={190} agent={SYNTHESISER} blurb={SYNTHESISER.blurb} />

        <Node x={980} y={198} r={32} agent={REPORT_NODE} />
        <text x="980" y="252" textAnchor="middle" fontSize="12" fontWeight="600" letterSpacing="0.06em" fill="var(--text-gray)">YOUR REPORT</text>
      </svg>

      {/* ── Narrow layout ── */}
      <svg className="pipeline-svg pipeline-svg--narrow" viewBox="0 0 380 800" preserveAspectRatio="xMidYMid meet">
        <ArrowDefs />

        <text x="190" y="16" textAnchor="middle" fontSize="12" fontWeight="600" letterSpacing="0.08em" fill="var(--text-gray)">YOUR ABSTRACT</text>
        <Node x={190} y={56} r={26} agent={ABSTRACT_NODE} />

        <Edge d={sCurveV(182, 80, 110, 130)} color={analyser.color} />
        <Edge d={sCurveV(198, 80, 270, 130)} color={researcher.color} />

        <Edge d={pinchCurveV(110, 210, 110, 400, 190)} color={analyser.color} />
        <Edge d={pinchCurveV(270, 210, 110, 400, 190)} color={researcher.color} />
        <Edge d={pinchCurveV(270, 210, 270, 400, 190)} color={researcher.color} />

        <Edge d={pinchCurveV(110, 440, 190, 544, 190)} color={committee.color} />
        <Edge d={pinchCurveV(270, 440, 190, 544, 190)} color={audience.color} />

        <Edge d={sCurveV(190, 698, 190, 708)} color={SYNTHESISER.color} />

        <Node x={110} y={170} r={40} agent={analyser} />
        <FeedbackBadge cx={110} cy={170} r={40} />
        <NodeLabel x={110} y={218} width={140} height={100} agent={analyser} blurb={AGENT_BLURBS.analyser} />

        <Node x={270} y={170} r={40} agent={researcher} />
        <FeedbackBadge cx={270} cy={170} r={40} />
        <NodeLabel x={270} y={218} width={140} height={100} agent={researcher} blurb={AGENT_BLURBS.researcher} />

        <Node x={110} y={400} r={40} agent={committee} />
        <NodeLabel x={110} y={448} width={140} height={100} agent={committee} blurb={AGENT_BLURBS.committee} />

        <Node x={270} y={400} r={40} agent={audience} />
        <NodeLabel x={270} y={448} width={140} height={100} agent={audience} blurb={AGENT_BLURBS.audience} />

        <Node x={190} y={590} r={46} agent={SYNTHESISER} big />
        <NodeLabel x={190} y={598} width={180} height={100} agent={SYNTHESISER} blurb={SYNTHESISER.blurb} />

        <Node x={190} y={734} r={26} agent={REPORT_NODE} />
        <text x="190" y="782" textAnchor="middle" fontSize="12" fontWeight="600" letterSpacing="0.08em" fill="var(--text-gray)">YOUR REPORT</text>
      </svg>
    </div>
  );
}
