// Rooms: a shared page two phones write on. The server keeps each room's
// metadata and an append-only log of opaque actions; it knows nothing about
// the game. Clients replay the log through the engine, which is what checks a
// move is legal. The server only guarantees order: an action is appended at
// index i only if the log has exactly i entries (compare-and-set), and only by
// the device holding that seat's secret.
//
// Storage is Redis (Upstash over REST). Each room is two keys:
//   room:<code>:m    hash  v, engine, setup, theme, created, name0/1, secret0/1
//   room:<code>:log  list  one JSON entry per action, never decoded in Lua
// Every write is one Lua script, so it's atomic and a single round trip.

import type { Entry, RoomView, Seat } from "../src/room-protocol.js";

/** The one Redis call the store needs; @upstash/redis's `eval` fits it. */
export interface Evaluator {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export const TTL_S = 30 * 24 * 60 * 60; // rooms live 30 days past their last move
export const LIMITS = { name: 24, setup: 2048, action: 4096, theme: 32, log: 3000 };

const CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz"; // no 0/o, 1/i/l
export const CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/;

const keys = (code: string) => [`room:${code}:m`, `room:${code}:log`];

export const SCRIPTS = {
  // ARGV: engine, setup, theme, created, name0, secret0, ttl
  create: `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'v', '1', 'engine', ARGV[1], 'setup', ARGV[2], 'theme', ARGV[3], 'created', ARGV[4], 'name0', ARGV[5], 'secret0', ARGV[6])
redis.call('EXPIRE', KEYS[1], ARGV[7])
return 1`,
  // ARGV: name, secret, ttl. Returns the seat taken, -1 no room, -2 full.
  join: `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
for seat = 0, 1 do
  if redis.call('HEXISTS', KEYS[1], 'secret' .. seat) == 0 then
    redis.call('HSET', KEYS[1], 'name' .. seat, ARGV[1], 'secret' .. seat, ARGV[2])
    redis.call('EXPIRE', KEYS[1], ARGV[3])
    if redis.call('EXISTS', KEYS[2]) == 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
    return seat
  end
end
return -2`,
  // ARGV: seat, secret, index, entry, ttl, max. Returns {status, n}:
  // 1 appended (n = new length), -1 no room or empty seat, -2 wrong secret, -3 conflict (n = length), -4 log full.
  append: `
local secret = redis.call('HGET', KEYS[1], 'secret' .. ARGV[1])
if not secret then return {-1, 0} end
if secret ~= ARGV[2] then return {-2, 0} end
local n = redis.call('LLEN', KEYS[2])
if n ~= tonumber(ARGV[3]) then return {-3, n} end
if n >= tonumber(ARGV[6]) then return {-4, n} end
n = redis.call('RPUSH', KEYS[2], ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
redis.call('EXPIRE', KEYS[2], ARGV[5])
return {1, n}`,
  // ARGV: since. Returns false for no room, else {engine, setup, theme, created, name0, name1, seat1taken, n, {entries...}}.
  read: `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
local m = redis.call('HMGET', KEYS[1], 'engine', 'setup', 'theme', 'created', 'name0', 'name1')
local taken = redis.call('HEXISTS', KEYS[1], 'secret1')
local n = redis.call('LLEN', KEYS[2])
local log = redis.call('LRANGE', KEYS[2], tonumber(ARGV[1]), -1)
return {m[1] or '', m[2] or '', m[3] or '', m[4] or '0', m[5] or '', m[6] or '', taken, n, log}`,
};

export class RoomError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function random(n: number, alphabet: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  // 256 % 31 leaves a tiny bias; irrelevant for room codes
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
export const newCode = () => random(6, CODE_CHARS);
const newSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

export function cleanName(v: unknown): string {
  const s = typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim() : "";
  return s.slice(0, LIMITS.name);
}

function code(v: unknown): string {
  if (typeof v !== "string" || !CODE_RE.test(v)) throw new RoomError(404, "no such room");
  return v;
}

export function rooms(redis: Evaluator, now = () => Date.now()) {
  return {
    async create(body: { name?: unknown; engine?: unknown; setup?: unknown; theme?: unknown }) {
      const name = cleanName(body.name);
      if (!name) throw new RoomError(400, "name required");
      if (typeof body.engine !== "string" || !body.engine || body.engine.length > 32) throw new RoomError(400, "engine required");
      const setup = JSON.stringify(body.setup ?? null);
      if (setup.length > LIMITS.setup) throw new RoomError(400, "setup too big");
      const theme = typeof body.theme === "string" ? body.theme.slice(0, LIMITS.theme) : "";
      const secret = newSecret();
      for (let tries = 0; tries < 6; tries++) {
        const c = newCode();
        const ok = await redis.eval(SCRIPTS.create, keys(c), [body.engine, setup, theme, String(now()), name, secret, String(TTL_S)]);
        if (Number(ok) === 1) return { code: c, seat: 0 as Seat, secret };
      }
      throw new RoomError(503, "no free room code");
    },

    async join(body: { code?: unknown; name?: unknown }) {
      const c = code(body.code);
      const name = cleanName(body.name);
      if (!name) throw new RoomError(400, "name required");
      const secret = newSecret();
      const seat = Number(await redis.eval(SCRIPTS.join, keys(c), [name, secret, String(TTL_S)]));
      if (seat === -1) throw new RoomError(404, "no such room");
      if (seat === -2) return { seat: null, secret: null };
      return { seat: seat as Seat, secret };
    },

    async act(body: { code?: unknown; seat?: unknown; secret?: unknown; i?: unknown; a?: unknown }) {
      const c = code(body.code);
      const { seat, secret, i } = body;
      if ((seat !== 0 && seat !== 1) || typeof secret !== "string" || !Number.isInteger(i) || (i as number) < 0 || body.a === undefined)
        throw new RoomError(400, "bad action");
      const entry: Entry = { seat, a: body.a, at: now() };
      const raw = JSON.stringify(entry);
      if (raw.length > LIMITS.action) throw new RoomError(413, "action too big");
      const r = (await redis.eval(SCRIPTS.append, keys(c), [String(seat), secret, String(i), raw, String(TTL_S), String(LIMITS.log)])) as [number, number];
      const [status, n] = [Number(r[0]), Number(r[1])];
      if (status === 1) return { n };
      if (status === -1) throw new RoomError(404, "no such room or seat");
      if (status === -2) throw new RoomError(403, "not your seat");
      if (status === -3) throw new RoomError(409, "the page has moved on", { n });
      throw new RoomError(413, "the page is full", { n });
    },

    async read(q: { code?: unknown; since?: unknown }): Promise<RoomView> {
      const c = code(q.code);
      const since = Math.max(0, Math.floor(Number(q.since) || 0));
      const r = (await redis.eval(SCRIPTS.read, keys(c), [String(since)])) as unknown[] | null;
      if (!r) throw new RoomError(404, "no such room");
      const [engine, setup, theme, created, name0, name1, taken, n, log] = r as [string, string, string, string, string, string, number, number, string[]];
      return {
        code: c,
        engine: String(engine),
        setup: JSON.parse(String(setup) || "null"),
        theme: theme ? String(theme) : undefined,
        created: Number(created),
        names: [String(name0), Number(taken) === 1 ? String(name1) : null],
        n: Number(n),
        since,
        entries: (log ?? []).map((s) => JSON.parse(String(s)) as Entry),
      };
    },
  };
}

export type Rooms = ReturnType<typeof rooms>;
