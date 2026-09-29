// GET  /api/room?code=abc234&since=7   the room and its log from entry 7
// POST /api/room {op:"create", name, engine, setup, theme}
// POST /api/room {op:"join", code, name}
// POST /api/room {op:"act", code, seat, secret, i, a}
// One function for all of it: fewer cold starts, one bundle. See `_rooms.ts`.

import { Redis } from "@upstash/redis";
import { RoomError, rooms, type Rooms } from "./_rooms.js";

declare const process: { env: Record<string, string | undefined> };

let store: Rooms | null = null;
function get(): Rooms {
  if (store) return store;
  const env = process.env;
  // the Vercel Marketplace names them KV_*; a direct Upstash database, UPSTASH_REDIS_*
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new RoomError(503, "rooms aren't set up on this server yet");
  // keep strings as strings: log entries are parsed by us, exactly once
  const redis = new Redis({ url, token, automaticDeserialization: false });
  store = rooms({ eval: (s, k, a) => redis.eval(s, k, a) });
  return store;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function run(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof RoomError) return json({ error: e.message, ...e.extra }, e.status);
    console.error(e);
    return json({ error: "something went wrong" }, 500);
  }
}

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return run(() => get().read({ code: q.get("code"), since: q.get("since") }));
}

export function POST(req: Request) {
  return run(async () => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new RoomError(400, "bad request");
    const r = get();
    if (body.op === "create") return r.create(body);
    if (body.op === "join") return r.join(body);
    if (body.op === "act") return r.act(body);
    throw new RoomError(400, "unknown op");
  });
}
