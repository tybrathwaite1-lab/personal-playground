/**
 * Classifies one link-check result for a standalone discovery, so editors see what kind of
 * problem it is instead of a bare status code. Pure (no network), so it's tested directly.
 *
 *  invalid      structurally wrong (not an absolute https URL that passes isSafeUrl): fix the record
 *  ok           reachable (2xx/3xx)
 *  intentional  unavailable, but the record says this happens by design (e.g. solar-powered, offline
 *               in bad weather); not a failure
 *  permanent    gone (404, 410) or the host doesn't exist (DNS): needs an editorial decision
 *  blocked      the site refused the checker (401, 403, 451): often bot protection; needs a look
 *  transient    timeouts, resets, rate limits (429), server errors (5xx): try again later
 */
import { isHttpsUrl } from '../../src/utils/dropValidate.ts';

export type LinkClass = 'invalid' | 'ok' | 'intentional' | 'permanent' | 'blocked' | 'transient';

/** A completed request's HTTP status, or the name/code of the error that stopped it. */
export type CheckOutcome = { status: number } | { error: string };

export function classifyLink(url: string, outcome: CheckOutcome, availability?: 'intermittent' | 'javascript-required'): LinkClass {
  if (!isHttpsUrl(url)) return 'invalid';
  if ('status' in outcome) {
    const s = outcome.status;
    if (s >= 200 && s < 400) return 'ok';
    if (availability === 'intermittent' && (s >= 500 || s === 408)) return 'intentional';
    if (s === 404 || s === 410) return 'permanent';
    if (s === 401 || s === 403 || s === 451) return 'blocked';
    return 'transient'; // 408, 429, 5xx and anything unusual: check again before deciding
  }
  const e = outcome.error;
  if (/ENOTFOUND|EAI_NONAME/.test(e)) return 'permanent';
  if (availability === 'intermittent') return 'intentional';
  return 'transient'; // AbortError/timeouts, ECONNRESET, ECONNREFUSED, TLS hiccups…
}

/** Classes that need a recorded editorial decision (linkReviews) before a record is published. */
export const NEEDS_REVIEW: ReadonlySet<LinkClass> = new Set<LinkClass>(['permanent', 'blocked']);
