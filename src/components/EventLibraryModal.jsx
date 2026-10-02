// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { fetchEvents } from "../lib/events";

/**
 * Pop-up for the saved-event library: lets the submitter pick a previously
 * saved event (a conference whose CFP Analyser / Conference Researcher
 * verdicts were already produced), so evaluating another session for it
 * skips straight to the Programme Committee / Audience / Synthesiser agents.
 *
 * Unlike the session library, events are only created from the results
 * screen (via "Save this event") — this modal is select-only.
 *
 * @param {function(): void} onClose - Called when the modal should be dismissed.
 * @param {function(object): void} onSelect - Called with the chosen event.
 */
export default function EventLibraryModal({ onClose, onSelect }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchEvents()
      .then((list) => setEvents(list))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="config-overlay" onClick={onClose}>
      <div className="session-modal" onClick={(e) => e.stopPropagation()}>
        <div className="config-modal-header">
          <span style={{ fontSize: 20 }}>🗂️</span>
          <div style={{ flex: 1 }}>
            <div className="config-modal-title">SAVED EVENTS</div>
            <div className="config-modal-sub">Reuse a prior CFP analysis and conference research</div>
          </div>
          <button onClick={onClose} className="config-modal-close" aria-label="Close">×</button>
        </div>

        <div className="session-list">
          {loading && <div className="session-list-status">Loading saved events…</div>}
          {!loading && error && <div className="session-list-status">{error}</div>}
          {!loading && !error && events.length === 0 && (
            <div className="session-list-status">
              No saved events yet — after an evaluation finishes, use "Save this event" to add one.
            </div>
          )}
          {!loading && events.map((ev) => (
            <button key={ev.id} className="event-list-item" onClick={() => onSelect(ev)}>
              <div className="session-list-item-title">{ev.name}</div>
              {ev.eventUrl && <div className="session-list-item-abstract">{ev.eventUrl}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
