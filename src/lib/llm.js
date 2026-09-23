// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Error thrown when the proxy returns a non-2xx response.
 * Carries the HTTP status and, for 429s, the provider's suggested backoff
 * so the caller can wait exactly as long as the provider asked.
 */
export class LLMError extends Error {
  constructor(message, { status = null, retryAfter = null } = {}) {
    super(message);
    this.name = "LLMError";
    this.status = status;
    this.retryAfter = retryAfter;
  }

  /** True when the provider rejected the call for exceeding a rate limit. */
  get isRateLimit() {
    return this.status === 429;
  }
}

/**
 * Call the configured LLM provider via the local proxy at /api/chat.
 *
 * @param {object} config        - { provider, apiKey, model }
 * @param {string} systemPrompt  - Role / system instruction
 * @param {string} userMessage   - User turn content
 * @param {number} maxTokens     - Maximum output tokens (default 1000)
 * @returns {Promise<string>}    - Plain text response from the model
 * @throws  {LLMError}           - On any non-2xx response from the proxy
 */
export async function callLLM(config, systemPrompt, userMessage, maxTokens = 1000) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers["x-user-api-key"] = config.apiKey;

  const response = await fetch("/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: config.provider || "anthropic",
      model: config.model,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      max_tokens: maxTokens,
    }),
  });

  // A proxy that died mid-request can return a non-JSON body; don't let the
  // parse failure mask the real HTTP status.
  let data = {};
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new LLMError(`API error (HTTP ${response.status})`, { status: response.status });
    }
    throw new LLMError("Malformed response from proxy.");
  }

  if (!response.ok) {
    throw new LLMError(data.error?.message || "API error", {
      status: response.status,
      retryAfter: data.error?.retryAfter ?? null,
    });
  }
  return data.text;
}
