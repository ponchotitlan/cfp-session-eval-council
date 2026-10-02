// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { fetchSessions, saveSession, updateSession } from "../lib/sessions";

/**
 * One row in the saved-session list. Either shows the title/abstract as a
 * button that selects it, with a small edit affordance beside it, or — while
 * being edited — an inline title/abstract form with its own save/cancel.
 */
function SessionRow({ session, onSelect, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [abstract, setAbstract] = useState(session.abstract);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEdit = (e) => {
    e.stopPropagation();
    setTitle(session.title);
    setAbstract(session.abstract);
    setError("");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !abstract.trim()) {
      setError("Please provide both a title and an abstract.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await updateSession(session.id, { title, abstract });
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="session-list-item session-list-item--editing">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="config-input"
        />
        <textarea
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          rows={3}
          className="input input--textarea"
        />
        {error && <div className="delay-error">{error}</div>}
        <div className="session-edit-actions">
          <button onClick={handleSave} disabled={saving} className="btn-session-save">
            {saving ? "SAVING…" : "SAVE"}
          </button>
          <button onClick={() => setEditing(false)} className="btn-session-cancel">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="session-list-item">
      <button className="session-list-item-select" onClick={() => onSelect(session)}>
        <div className="session-list-item-title">{session.title}</div>
        <div className="session-list-item-abstract">{session.abstract}</div>
      </button>
      <button className="session-list-item-edit" onClick={startEdit} aria-label="Edit this session" title="Edit">
        ✏️
      </button>
    </div>
  );
}

/**
 * Pop-up for the saved-session library: a reusable list of { title, abstract }
 * pairs the submitter has written once and can reuse across events, instead
 * of retyping them. Lets the submitter record a new one, edit an existing
 * one, and pick any of them.
 *
 * @param {function(): void} onClose - Called when the modal should be dismissed.
 * @param {function({title: string, abstract: string}): void} onSelect - Called
 *   with the chosen session when the submitter clicks one in the list.
 */
export default function SessionLibraryModal({ onClose, onSelect }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newAbstract, setNewAbstract] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetchSessions()
      .then((list) => setSessions(list))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!newTitle.trim() || !newAbstract.trim()) {
      setSaveError("Please provide both a title and an abstract.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const session = await saveSession({ title: newTitle, abstract: newAbstract });
      setSessions((prev) => [session, ...prev]);
      setNewTitle("");
      setNewAbstract("");
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="config-overlay" onClick={onClose}>
      <div className="session-modal" onClick={(e) => e.stopPropagation()}>
        <div className="config-modal-header">
          <span style={{ fontSize: 20 }}>📚</span>
          <div style={{ flex: 1 }}>
            <div className="config-modal-title">SAVED SESSIONS</div>
            <div className="config-modal-sub">Record a new one, or pick one to reuse</div>
          </div>
          <button onClick={onClose} className="config-modal-close" aria-label="Close">×</button>
        </div>

        <div className="session-new-form">
          <input
            value={newTitle}
            onChange={(e) => { setNewTitle(e.target.value); setSaveError(""); }}
            placeholder="New session title"
            className="config-input"
          />
          <textarea
            value={newAbstract}
            onChange={(e) => { setNewAbstract(e.target.value); setSaveError(""); }}
            placeholder="New session abstract"
            rows={3}
            className="input input--textarea"
          />
          {saveError && <div className="delay-error">{saveError}</div>}
          <button onClick={handleSave} disabled={saving} className="btn-save">
            {saving ? "SAVING…" : "+ SAVE NEW SESSION"}
          </button>
        </div>

        <div className="session-list">
          {loading && <div className="session-list-status">Loading saved sessions…</div>}
          {!loading && error && <div className="session-list-status">{error}</div>}
          {!loading && !error && sessions.length === 0 && (
            <div className="session-list-status">No saved sessions yet — add one above.</div>
          )}
          {!loading && sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onSelect={onSelect}
              onSaved={(updated) => setSessions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
