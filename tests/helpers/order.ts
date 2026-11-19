import assert from 'node:assert/strict';

/**
 * Asserts that every marker occurs in `text`, in the given order. Unlike comparing
 * `indexOf` results directly, a missing marker fails instead of reading as position -1,
 * so the check can't silently pass after the text it describes is rewritten.
 */
export function assertInOrder(text: string, markers: string[], what = 'text'): void {
  let from = 0;
  let prev = '(start)';
  for (const m of markers) {
    const at = text.indexOf(m);
    assert.ok(at >= 0, `${what}: marker not found: ${JSON.stringify(m)}`);
    assert.ok(at >= from, `${what}: ${JSON.stringify(m)} must come after ${JSON.stringify(prev)}`);
    from = at + m.length;
    prev = m;
  }
}
