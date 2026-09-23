// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic conference-programme retrieval.
 *
 * Given an event URL, finds the pages most likely to hold the programme or an
 * archive of past editions, extracts them, and returns a size-capped digest
 * with a source URL per section.
 *
 * No LLM, no API key, no third-party service — it is a plain fetch of pages
 * the user has pointed us at. It succeeds on static conference sites and
 * fails cleanly (see `ok` / `reason`) on JS-rendered or bot-blocked ones, so
 * the caller can fall back to asking the user.
 */

const UA =
  "Mozilla/5.0 (compatible; cfp-session-eval-council/0.1; +https://github.com/ponchotitlan/cfp-session-eval-council)";
const TIMEOUT_MS = 7000;
// Whole-operation ceiling. Per-request timeouts alone are not enough: three
// slow candidates could otherwise stall the researcher for half a minute.
const TOTAL_BUDGET_MS = 18000;
const MAX_PAGES = 3;
const PER_PAGE_CHARS = 6000;
const TOTAL_CHARS = 12000;
const POLITE_DELAY_MS = 300;

// Thresholds for "tier 1 actually worked". Calibrated against real sites: a
// JS-rendered shell yields a few hundred characters and single-digit titles.
const MIN_DIGEST_CHARS = 1500;
const MIN_TITLE_LINES = 15;

// Anchor signals that a link leads to a programme or an archive.
const STRONG = /\b(programme|program|schedule|agenda|sessions?|talks?|archive|line-?up|speakers?|tracks?)\b/i;
const PAST = /\b(past|previous|archive|editions?)\b/i;
// Editorial content, which dates alone would otherwise rank highly.
const JUNK = /\/(articles?|blog|news|posts?|stories|press|category|tag|author)\//i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, deadline = Infinity) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { ok: false, why: "time budget exhausted" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.min(TIMEOUT_MS, remaining));
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
      signal: ctl.signal,
      redirect: "follow",
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    if (!/html|text/i.test(type)) return { ok: false, why: `content-type ${type.split(";")[0]}` };
    return { ok: true, html: await res.text(), finalUrl: res.url };
  } catch (e) {
    return { ok: false, why: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimal robots.txt check for the `User-agent: *` group, prefix-matched.
 * Fails open: if robots.txt cannot be read, fetching is allowed.
 */
async function buildRobots(origin, deadline) {
  const res = await get(`${origin}/robots.txt`, deadline).catch(() => ({ ok: false }));
  if (!res.ok) return () => true;

  const disallow = [];
  let inStar = false;
  for (const line of res.html.split("\n")) {
    const text = line.split("#")[0].trim();
    if (!text) continue;
    const [rawKey, ...rest] = text.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") inStar = value === "*";
    else if (inStar && key === "disallow" && value) disallow.push(value);
  }
  return (url) => {
    try {
      const path = new URL(url).pathname;
      return !disallow.some((rule) => path.startsWith(rule));
    } catch {
      return false;
    }
  };
}

const stripChrome = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");

const toText = (html) =>
  stripChrome(html)
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

/** Ranks outbound links by how likely they are to be a programme or archive index. */
function rankLinks(html, base) {
  const baseOrigin = new URL(base).origin;
  const found = new Map();

  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    const text = toText(m[2]).slice(0, 120);
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) continue;

    let u;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    if (JUNK.test(u.pathname)) continue;

    // A date alone is not evidence of a programme page — require a programme
    // word, or a year-scoped host/path (2026.event.org, event.org/2025/),
    // which is how conferences usually archive past editions.
    const yearScoped = /(^|\.)20\d\d\./.test(u.hostname) || /\/20\d\d(\/|$)/.test(u.pathname);
    const hay = `${u.pathname} ${text}`;
    if (!STRONG.test(hay) && !yearScoped) continue;

    let score = 0;
    if (STRONG.test(u.pathname)) score += 4; // in the path beats in the link text
    else if (STRONG.test(text)) score += 2;
    if (yearScoped) score += 3;
    if (PAST.test(hay)) score += 2;
    if ((u.pathname.match(/-/g) || []).length >= 3) score -= 3; // article-shaped slug
    if (u.origin === baseOrigin) score += 1;

    if (score > 0 && !found.has(u.href)) found.set(u.href, { url: u.href, text, score });
  }

  return [...found.values()].sort((a, b) => b.score - a.score);
}

/** Lines that look like session titles rather than navigation or boilerplate. */
function titleLines(text) {
  const seen = new Set();
  const hits = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length < 18 || line.length > 140) continue;
    if (!/[a-z]/.test(line) || !/^[A-Z0-9"“']/.test(line)) continue;
    if (/^(home|about|contact|register|sponsor|cookie|privacy|menu|search|login|sign in)\b/i.test(line)) continue;
    if ((line.match(/\s/g) || []).length < 3) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(line);
  }
  return hits;
}

/**
 * @param {string} eventUrl
 * @returns {Promise<{ok: boolean, digest: string, sources: string[], reason: string|null, stats: object}>}
 */
export async function researchConference(eventUrl) {
  const empty = (reason) => ({ ok: false, digest: "", sources: [], reason, stats: {} });

  let origin;
  try {
    origin = new URL(eventUrl).origin;
  } catch {
    return empty("no valid event URL was provided");
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const allowed = await buildRobots(origin, deadline);
  if (!allowed(eventUrl)) return empty("the site's robots.txt disallows fetching this page");

  const root = await get(eventUrl, deadline);
  if (!root.ok) return empty(`the event page could not be fetched (${root.why})`);

  const candidates = rankLinks(root.html, root.finalUrl).filter((c) => allowed(c.url));
  if (candidates.length === 0) {
    return empty("no programme or archive pages could be found from the event page");
  }

  const sources = [];
  let budget = TOTAL_CHARS;
  let totalTitles = 0;

  for (const candidate of candidates.slice(0, MAX_PAGES)) {
    if (budget <= 0 || Date.now() >= deadline) break;
    await sleep(POLITE_DELAY_MS);

    const page = await get(candidate.url, deadline);
    if (!page.ok) continue;

    const text = toText(page.html);
    const titles = titleLines(text);
    // Prefer the extracted title lines; fall back to raw text when the page
    // does not look like a listing.
    const body = (titles.length >= 5 ? titles.join("\n") : text).slice(
      0,
      Math.min(PER_PAGE_CHARS, budget),
    );
    if (!body) continue;

    budget -= body.length;
    totalTitles += titles.length;
    sources.push({ url: candidate.url, body, titleCount: titles.length });
  }

  const digest = sources.map((s) => `SOURCE: ${s.url}\n${s.body}`).join("\n\n---\n\n");
  const stats = {
    chars: digest.length,
    titleLines: totalTitles,
    pages: sources.length,
    candidates: candidates.length,
  };

  // A JS-rendered page returns a near-empty shell rather than an error, so
  // judge on what was actually extracted, not on HTTP status.
  if (digest.length < MIN_DIGEST_CHARS || totalTitles < MIN_TITLE_LINES) {
    return {
      ok: false,
      digest: "",
      sources: sources.map((s) => s.url),
      reason:
        "the programme pages returned too little content to be useful — they are most likely rendered by JavaScript",
      stats,
    };
  }

  return { ok: true, digest, sources: sources.map((s) => s.url), reason: null, stats };
}
