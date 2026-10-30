// Tiny TTL cache used by the provider ports (search/meta reuse).
export function createCache(ttlMs = 10 * 60 * 1000, maxEntries = 100) {
  /** @type {Map<string, { value: any, expires: number }>} */
  const map = new Map();

  return {
    get(key) {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        map.delete(key);
        return undefined;
      }
      // Refresh LRU position.
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      if (map.has(key)) map.delete(key);
      while (map.size >= maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      map.set(key, { value, expires: Date.now() + ttlMs });
    },
    clear() {
      map.clear();
    },
  };
}
