// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Lazy, cached MongoDB connection shared by every collection module
 * (sessions, events, ...). Nothing talks to Mongo until the first request
 * needs it, and every subsequent call reuses the same client/connection —
 * one pool for the whole proxy, not one per collection.
 */

import { MongoClient } from "mongodb";

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/cfp_sessions";

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
    dbPromise = client.connect().then((c) => c.db());
  }
  return dbPromise;
}
