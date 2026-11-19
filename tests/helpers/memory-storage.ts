/**
 * A minimal in-memory `localStorage` for tests, with switches for the failure modes browsers
 * really have: storage unavailable (access throws, e.g. blocked site data), reads that throw,
 * and writes that throw (quota exceeded, private mode). Installed on globalThis and restored
 * after each use, so tests never touch a real browser profile.
 */
export class MemoryStorage {
  data = new Map<string, string>();
  failReads = false;
  failWrites = false;
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.failReads) throw new DOMException('The operation is insecure.', 'SecurityError');
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    if (this.failWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}

/**
 * Runs `fn` with `globalThis.localStorage` replaced: a MemoryStorage, or — with `'unavailable'`
 * — a getter that throws, as browsers do when site data is blocked.
 */
export async function withStorage<T>(store: MemoryStorage | 'unavailable', fn: (s: MemoryStorage | null) => T | Promise<T>): Promise<T> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (store === 'unavailable')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access to storage is not allowed from this context.', 'SecurityError');
      },
    });
  else Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: store });
  try {
    return await fn(store === 'unavailable' ? null : store);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}
