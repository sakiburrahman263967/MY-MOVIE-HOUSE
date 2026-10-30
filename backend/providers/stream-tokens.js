// Opaque stream-token store (MovieBox-TUI port).
// Lets the backend hand the frontend a short-lived, unguessable token instead of
// a signed/credentialed upstream URL. Real target URLs + required headers
// (Referer / Cookie / User-Agent) NEVER leave the server.
import { randomUUID } from 'node:crypto';

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_ENTRIES = 800;

/** @type {Map<string, { url: string, headers: Record<string,string>, meta: object|null, expires: number }>} */
const store = new Map();

function sweep(now = Date.now()) {
  for (const [key, entry] of store) {
    if (entry.expires <= now) store.delete(key);
  }
}

/**
 * Issue an opaque token for a real stream URL.
 * @param {string} url - real upstream URL (kept server-side only)
 * @param {Record<string,string>} [headers] - headers the proxy must send upstream
 * @param {object|null} [meta] - internal refresh metadata (subjectId/resourceId/
 *   linkExpiresAt). Stored server-side only; never returned to the frontend.
 * @returns {string} opaque token
 */
export function issueStreamToken(url, headers = {}, meta = null) {
  const now = Date.now();
  sweep(now);
  if (store.size >= MAX_ENTRIES) {
    // Drop oldest entries so the map can never grow unbounded.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  const token = randomUUID();
  store.set(token, { url, headers: headers || {}, meta: meta || null, expires: now + TTL_MS });
  return token;
}

/**
 * Resolve a token back to its target. Returns null when unknown/expired.
 * @param {string} token
 */
export function resolveStreamToken(token) {
  if (typeof token !== 'string' || token.length < 8) return null;
  const entry = store.get(token);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    store.delete(token);
    return null;
  }
  return { url: entry.url, headers: entry.headers, meta: entry.meta || null };
}

/** True when the query param looks like one of our tokens instead of a URL. */
export function isStreamToken(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
