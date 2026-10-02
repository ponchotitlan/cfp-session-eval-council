// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Saved-session library — thin wrappers around the proxy's /api/sessions
 * routes. A session is just a reusable { title, abstract } pair the
 * submitter has written once, independent of any particular event.
 */

export async function fetchSessions() {
  const response = await fetch("/api/sessions");
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `could not load saved sessions (HTTP ${response.status})`);
  return data.sessions;
}

export async function saveSession({ title, abstract }) {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, abstract }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `could not save the session (HTTP ${response.status})`);
  return data.session;
}

export async function updateSession(id, { title, abstract }) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, abstract }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `could not update the session (HTTP ${response.status})`);
  return data.session;
}
