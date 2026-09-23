// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_CONFIG = {
  provider: "anthropic",
  apiKey: "",
  // Optional pre-emptive pause between agent calls. Defaults to 0: agents run
  // sequentially and rate-limit errors are retried automatically, so a fixed
  // delay is only useful on providers with very low request-per-minute limits.
  agentDelay: 0,
};

// Heuristic to detect if the analyser likely failed to access the CFP URL and needs the user to paste the text instead
export const analyserCouldNotAccess = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return [
    "cannot access", "can't access", "unable to access", "couldn't access",
    "not able to access", "i cannot browse", "don't have access",
    "could you please", "could you provide", "please provide", "please share",
    "paste the", "copy and paste",
  ].some((phrase) => lower.includes(phrase));
};

// Utility function to extract percentage scores from the synthesis text based on a given label.
// Looks for patterns like "Acceptance Likelihood: 85%" and returns the numeric score.
export const extractScore = (text, label) => {
  const match = text?.match(new RegExp(`${label}[^\\d]*(\\d+)\\s*%`, "i"));
  return match ? parseInt(match[1]) : null;
};
