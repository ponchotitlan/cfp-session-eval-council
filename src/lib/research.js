// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Ask the proxy to fetch the conference's programme pages.
 *
 * This is deterministic retrieval, not a model call: no API key is used and
 * nothing is billed. It is best-effort by design — a negative result is a
 * normal outcome, not an error, and the caller should fall back to asking the
 * user for examples.
 *
 * @param {string} eventUrl
 * @param {string} [pastAgendaUrl] - Direct link to a past edition's agenda,
 *   when the submitter already has it. Skips link-discovery for that source.
 * @returns {Promise<{ok: boolean, digest: string, sources: string[], reason: string|null, stats: object}>}
 */
export async function fetchResearch(eventUrl, pastAgendaUrl) {
  if (!eventUrl?.trim() && !pastAgendaUrl?.trim()) {
    return { ok: false, digest: "", sources: [], reason: "no event URL or past-agenda URL was provided", stats: {} };
  }
  try {
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventUrl: eventUrl?.trim(), pastAgendaUrl: pastAgendaUrl?.trim() }),
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        digest: "",
        sources: [],
        reason: data?.error?.message || `retrieval failed (HTTP ${response.status})`,
        stats: {},
      };
    }
    return data;
  } catch (e) {
    return {
      ok: false,
      digest: "",
      sources: [],
      reason: `retrieval could not be reached (${e.message})`,
      stats: {},
    };
  }
}

/**
 * Formats retrieved material for the researcher's prompt, labelling where it
 * came from. Returns "" when there is nothing verified to show, which is what
 * makes the prompt's "no programme data could be retrieved" branch fire.
 */
export function researchBlock({ research, pastTalks }) {
  if (pastTalks?.trim()) {
    return `RETRIEVED PROGRAMME MATERIAL (provided by the submitter — treat as verified):\n${pastTalks.trim()}`;
  }
  if (research?.ok && research.digest) {
    return `RETRIEVED PROGRAMME MATERIAL (fetched from the conference website — treat as verified):\n${research.digest}`;
  }
  return "";
}
