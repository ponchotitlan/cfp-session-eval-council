// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import prompts from "./prompts.yaml";

export const AGENTS = [
  {
    id: "analyser",
    label: "CFP Analyser",
    icon: "🔍",
    // Deep teal-blue — AA-readable on cream/white, distinct from the semantic tokens
    color: "#0F6C8C",
    desc: "Extracting key requirements from the Call for Papers",
    role: prompts.agents.analyser,
  },
  {
    id: "researcher",
    label: "Conference Researcher",
    icon: "📚",
    // Muted plum
    color: "#5B4B8A",
    desc: "Researching past accepted sessions and conference DNA",
    role: prompts.agents.researcher,
  },
  {
    id: "committee",
    label: "Programme Committee Member",
    icon: "🎯",
    // Forest green
    color: "#1E7A46",
    desc: "Evaluating from the committee's perspective",
    role: prompts.agents.committee,
  },
  {
    id: "audience",
    label: "Audience Member",
    icon: "🙋",
    // Rust/burnt-orange — kept distinct from --color-warning's ochre
    color: "#A8471F",
    desc: "Evaluating from the attendee's perspective",
    role: prompts.agents.audience,
  },
];

export const SYNTHESISER_PROMPT = prompts.synthesiser;
