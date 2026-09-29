import { RATE_LIMITS, RoomError, type Evaluator } from "./_rooms.js";

export type RoomOp = keyof typeof RATE_LIMITS;

// One EVAL round trip. Rejected traffic doesn't extend the window or grow
// the counter. Redis owns the clock; expiration and admission are atomic.
export const RATE_SCRIPT = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n >= tonumber(ARGV[1]) then
  return math.max(1, redis.call('TTL', KEYS[1]))
end
n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return 0`;

export function clientIp(req: Request): string {
  // Vercel supplies these headers. Local/non-Vercel requests without either
  // share a bucket rather than getting an unlimited bypass.
  return req.headers.get("x-real-ip")?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "unknown";
}

export async function rateLimit(redis: Evaluator, req: Request, op: RoomOp) {
  const budget = RATE_LIMITS[op];
  const retryAfter = Number(await redis.eval(RATE_SCRIPT, [`room-rate:${op}:${clientIp(req)}`],
    [String(budget.requests), String(budget.windowSeconds)]));
  if (retryAfter > 0) throw new RoomError(429, "too many room requests; wait and retry", { retryAfter });
}
