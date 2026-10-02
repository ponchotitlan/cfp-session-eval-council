// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import http from "http";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { researchConference } from "./research.js";
import { listSessions, createSession, updateSession } from "./sessions.js";
import { listEvents, createEvent } from "./events.js";

const PORT = 3001;

// How many times the AI SDK retries a retryable failure (429 / 5xx / network)
// before the error reaches us. Retries use exponential backoff and honour the
// provider's Retry-After header where one is sent.
const MAX_RETRIES = 4;

// ─── Rate-limit helpers ───────────────────────────────────────────────────────

/**
 * Extract the HTTP status code from an AI SDK provider error.
 * Different providers surface it under different property names.
 */
export function statusOf(err) {
  return err?.statusCode ?? err?.status ?? err?.response?.status ?? null;
}

/**
 * Parse a Retry-After value into seconds.
 * Providers send either a delta in seconds ("20") or an HTTP date.
 * Returns null when the value is absent or unparseable.
 */
export function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/**
 * Pull the provider's suggested retry delay (in seconds) off a rate-limit error.
 * Checks `retry-after-ms` first since it is more precise, then `retry-after`.
 */
export function retryAfterSeconds(err) {
  const headers = err?.responseHeaders ?? err?.response?.headers ?? {};
  const get = (name) =>
    typeof headers.get === "function" ? headers.get(name) : headers[name];

  const rawMs = get("retry-after-ms");
  if (rawMs) {
    const ms = Number(rawMs);
    if (Number.isFinite(ms)) return Math.max(0, Math.ceil(ms / 1000));
  }

  return parseRetryAfter(get("retry-after"));
}

// ─── Provider factory ─────────────────────────────────────────────────────────

function getModel(provider, apiKey, modelId) {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    default: // anthropic
      return createAnthropic({ apiKey })(modelId);
  }
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-user-api-key",
    });
    res.end();
    return;
  }

  const json = (status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(body));
  };

  // Deterministic conference research. No API key needed — this fetches
  // public pages directly and never calls a model.
  if (req.method === "POST" && req.url === "/api/research") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      let eventUrl, pastAgendaUrl;
      try {
        ({ eventUrl, pastAgendaUrl } = JSON.parse(raw));
      } catch {
        return json(400, { error: { message: "Invalid JSON body." } });
      }
      try {
        json(200, await researchConference(eventUrl, pastAgendaUrl));
      } catch (err) {
        // Retrieval is best-effort: report the failure as a normal negative
        // result so the caller falls back to asking the user.
        json(200, {
          ok: false,
          digest: "",
          sources: [],
          reason: `retrieval failed (${err.message || err})`,
          stats: {},
        });
      }
    });
    return;
  }

  // Saved-session library — a submitter's reusable { title, abstract }
  // pairs, kept in Mongo, independent of any particular event.
  if (req.method === "GET" && req.url === "/api/sessions") {
    listSessions()
      .then((sessions) => json(200, { sessions }))
      .catch((err) => json(503, { error: { message: `could not reach the session store (${err.message})` } }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/sessions") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      let title, abstract;
      try {
        ({ title, abstract } = JSON.parse(raw));
      } catch {
        return json(400, { error: { message: "Invalid JSON body." } });
      }
      try {
        const session = await createSession({ title, abstract });
        json(201, { session });
      } catch (err) {
        json(400, { error: { message: err.message || String(err) } });
      }
    });
    return;
  }

  const sessionIdMatch = req.url.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "PUT" && sessionIdMatch) {
    const id = sessionIdMatch[1];
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      let title, abstract;
      try {
        ({ title, abstract } = JSON.parse(raw));
      } catch {
        return json(400, { error: { message: "Invalid JSON body." } });
      }
      try {
        const session = await updateSession(id, { title, abstract });
        json(200, { session });
      } catch (err) {
        json(400, { error: { message: err.message || String(err) } });
      }
    });
    return;
  }

  // Saved-event library — a named conference's CFP Analyser / Conference
  // Researcher verdicts, reusable across future sessions for that event.
  if (req.method === "GET" && req.url === "/api/events") {
    listEvents()
      .then((events) => json(200, { events }))
      .catch((err) => json(503, { error: { message: `could not reach the event store (${err.message})` } }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/events") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      let name, eventUrl, cfpUrl, pastAgendaUrl, analyserVerdict, researcherVerdict;
      try {
        ({ name, eventUrl, cfpUrl, pastAgendaUrl, analyserVerdict, researcherVerdict } = JSON.parse(raw));
      } catch {
        return json(400, { error: { message: "Invalid JSON body." } });
      }
      try {
        const event = await createEvent({ name, eventUrl, cfpUrl, pastAgendaUrl, analyserVerdict, researcherVerdict });
        json(201, { event });
      } catch (err) {
        json(400, { error: { message: err.message || String(err) } });
      }
    });
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/chat") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found" } }));
    return;
  }

  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    const apiKey = req.headers["x-user-api-key"];
    if (!apiKey) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "No API key provided. Set one in the Settings panel." } }));
      return;
    }

    let provider, model, system, messages, max_tokens;
    try {
      ({ provider, model, system, messages, max_tokens } = JSON.parse(raw));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid JSON body." } }));
      return;
    }

    try {
      const { text } = await generateText({
        model: getModel(provider, apiKey, model),
        system,
        messages,
        maxTokens: max_tokens || 1000,
        maxRetries: MAX_RETRIES,
      });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ text }));
    } catch (err) {
      // Only reached once the SDK has exhausted MAX_RETRIES.
      const status = statusOf(err) || 502;
      const body = { error: { message: err.message || String(err) } };

      // Surface the provider's own backoff hint so the client can wait the
      // right amount of time instead of guessing.
      if (status === 429) {
        const retryAfter = retryAfterSeconds(err);
        if (retryAfter != null) body.error.retryAfter = retryAfter;
      }

      res.writeHead(status >= 400 && status < 600 ? status : 502, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(body));
    }
  });
});

server.listen(PORT, () => console.log(`Multi-LLM proxy listening on :${PORT}`));
