// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Saved-event library, backed by MongoDB.
 *
 * An "event" here is a named conference whose CFP Analyser and Conference
 * Researcher verdicts were already produced once and are worth reusing:
 * evaluating another session for the same event can then skip straight to
 * the Programme Committee / Audience / Synthesiser agents, spending no
 * tokens re-deriving the CFP analysis or the conference research.
 */

import { getDb } from "./db.js";

const COLLECTION = "events";

const getCollection = () => getDb().then((db) => db.collection(COLLECTION));

const toPublic = ({ _id, name, eventUrl, cfpUrl, pastAgendaUrl, analyserVerdict, researcherVerdict, createdAt }) => ({
  id: _id.toString(),
  name,
  eventUrl,
  cfpUrl,
  pastAgendaUrl,
  analyserVerdict,
  researcherVerdict,
  createdAt,
});

/** Most recently created first. */
export async function listEvents() {
  const col = await getCollection();
  const docs = await col.find({}).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map(toPublic);
}

export async function createEvent({ name, eventUrl, cfpUrl, pastAgendaUrl, analyserVerdict, researcherVerdict }) {
  const trimmedName = (name || "").trim();
  const trimmedAnalyser = (analyserVerdict || "").trim();
  const trimmedResearcher = (researcherVerdict || "").trim();
  if (!trimmedName) throw new Error("name is required");
  if (!trimmedAnalyser || !trimmedResearcher) {
    throw new Error("both the CFP Analyser and Conference Researcher verdicts are required");
  }
  const col = await getCollection();
  const doc = {
    name: trimmedName,
    eventUrl: (eventUrl || "").trim(),
    cfpUrl: (cfpUrl || "").trim(),
    pastAgendaUrl: (pastAgendaUrl || "").trim(),
    analyserVerdict: trimmedAnalyser,
    researcherVerdict: trimmedResearcher,
    createdAt: new Date().toISOString(),
  };
  const { insertedId } = await col.insertOne(doc);
  return toPublic({ _id: insertedId, ...doc });
}
