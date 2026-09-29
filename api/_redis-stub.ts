// Just enough Redis for the room scripts, for tests: hashes, lists and TTLs,
// each Lua script's logic mirrored in JS. Not deployed (underscore file).

import { SCRIPTS, type Evaluator } from "./_rooms.js";

export function stubRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const lists = new Map<string, string[]>();
  const ttl = new Map<string, number>();
  const exists = (k: string) => hashes.has(k) || lists.has(k);
  const ev: Evaluator & { hashes: typeof hashes; lists: typeof lists; ttl: typeof ttl } = {
    hashes, lists, ttl,
    async eval(script, [m, log], a) {
      if (script === SCRIPTS.create) {
        if (exists(m)) return 0;
        hashes.set(m, new Map([["v", "1"], ["engine", a[0]], ["setup", a[1]], ["theme", a[2]], ["created", a[3]], ["name0", a[4]], ["secret0", a[5]]]));
        ttl.set(m, +a[6]);
        return 1;
      }
      if (script === SCRIPTS.join) {
        const h = hashes.get(m);
        if (!h) return -1;
        for (const seat of [0, 1]) {
          if (!h.has(`secret${seat}`)) {
            h.set(`name${seat}`, a[0]);
            h.set(`secret${seat}`, a[1]);
            ttl.set(m, +a[2]);
            if (lists.has(log)) ttl.set(log, +a[2]);
            return seat;
          }
        }
        return -2;
      }
      if (script === SCRIPTS.append) {
        const secret = hashes.get(m)?.get(`secret${a[0]}`);
        if (secret === undefined) return [-1, 0];
        if (secret !== a[1]) return [-2, 0];
        const l = lists.get(log) ?? [];
        if (l.length !== +a[2]) return [-3, l.length];
        if (l.length >= +a[5]) return [-4, l.length];
        l.push(a[3]);
        lists.set(log, l);
        ttl.set(m, +a[4]);
        ttl.set(log, +a[4]);
        return [1, l.length];
      }
      if (script === SCRIPTS.read) {
        const h = hashes.get(m);
        if (!h) return null;
        const l = lists.get(log) ?? [];
        const g = (k: string) => h.get(k) ?? "";
        return [g("engine"), g("setup"), g("theme"), h.get("created") ?? "0", g("name0"), g("name1"), h.has("secret1") ? 1 : 0, l.length, l.slice(+a[0])];
      }
      throw new Error("unknown script");
    },
  };
  return ev;
}

