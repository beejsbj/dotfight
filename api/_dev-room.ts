// Only loaded by Vite's explicit ROOM_REDIS_STUB=1 mode; not a Vercel route.
import { stubRedis } from "./_redis-stub.js";
import { roomHandler } from "./room.js";

export const handler = roomHandler(stubRedis());
