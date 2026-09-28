// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import prompts from "./prompts.yaml";

export const AGENTS = [
  {
    id: "analyser",
    label: "CFP Analyser",
    icon: "🔍",
    // Cisco dark-theme --cisco-cyan
    color: "#33C9F0",
    desc: "Extracting key requirements from the Call for Papers",
    role: prompts.agents.analyser,
  },
  {
    id: "researcher",
    label: "Conference Researcher",
    icon: "📚",
    // Cisco dark-theme --cisco-cyan-light
    color: "#7FD3EE",
    desc: "Researching past accepted sessions and conference DNA",
    role: prompts.agents.researcher,
  },
  {
    id: "committee",
    label: "Programme Committee Member",
    icon: "🎯",
    // Cisco dark-theme --color-success
    color: "#5FD97A",
    desc: "Evaluating from the committee's perspective",
    role: prompts.agents.committee,
  },
  {
    id: "audience",
    label: "Audience Member",
    icon: "🙋",
    // Not a Cisco token — one-off amber accent for the 4th agent identity
    color: "#F0B429",
    desc: "Evaluating from the attendee's perspective",
    role: prompts.agents.audience,
  },
];

export const SYNTHESISER_PROMPT = prompts.synthesiser;
