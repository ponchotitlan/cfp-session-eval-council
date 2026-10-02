// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Saved-session library, backed by MongoDB.
 *
 * A "session" here is just a reusable { title, abstract } pair the submitter
 * has written once and wants to pick from later, for this event or another
 * one — it carries no event-specific data (URLs, scores, agent output).
 *
 * A Mongo outage fails only the /api/sessions routes, not the rest of the
 * proxy (LLM calls, research retrieval) — see db.js for the shared, lazy
 * connection every collection module draws from.
 */

import { ObjectId } from "mongodb";
import { getDb } from "./db.js";

const COLLECTION = "sessions";

const getCollection = () => getDb().then((db) => db.collection(COLLECTION));

const toPublic = ({ _id, title, abstract, createdAt }) => ({
  id: _id.toString(),
  title,
  abstract,
  createdAt,
});

/** Most recently created first. */
export async function listSessions() {
  const col = await getCollection();
  const docs = await col.find({}).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map(toPublic);
}

export async function createSession({ title, abstract }) {
  const trimmedTitle = (title || "").trim();
  const trimmedAbstract = (abstract || "").trim();
  if (!trimmedTitle || !trimmedAbstract) {
    throw new Error("title and abstract are both required");
  }
  const col = await getCollection();
  const doc = { title: trimmedTitle, abstract: trimmedAbstract, createdAt: new Date().toISOString() };
  const { insertedId } = await col.insertOne(doc);
  return toPublic({ _id: insertedId, ...doc });
}

function parseObjectId(id) {
  try {
    return new ObjectId(id);
  } catch {
    throw new Error("invalid session id");
  }
}

export async function updateSession(id, { title, abstract }) {
  const objectId = parseObjectId(id);
  const trimmedTitle = (title || "").trim();
  const trimmedAbstract = (abstract || "").trim();
  if (!trimmedTitle || !trimmedAbstract) {
    throw new Error("title and abstract are both required");
  }
  const col = await getCollection();
  const { matchedCount } = await col.updateOne(
    { _id: objectId },
    { $set: { title: trimmedTitle, abstract: trimmedAbstract } },
  );
  if (matchedCount === 0) throw new Error("session not found");
  return toPublic(await col.findOne({ _id: objectId }));
}

export async function deleteSession(id) {
  const objectId = parseObjectId(id);
  const col = await getCollection();
  const { deletedCount } = await col.deleteOne({ _id: objectId });
  return deletedCount > 0;
}
