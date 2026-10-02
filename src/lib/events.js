// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Saved-event library — thin wrappers around the proxy's /api/events
 * routes. An event bundles a name with the CFP Analyser / Conference
 * Researcher verdicts already produced for it, so a future session can be
 * evaluated against the same event without spending tokens re-deriving them.
 */

export async function fetchEvents() {
  const response = await fetch("/api/events");
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `could not load saved events (HTTP ${response.status})`);
  return data.events;
}

export async function saveEvent(event) {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `could not save the event (HTTP ${response.status})`);
  return data.event;
}
