import { VercelRequest, VercelResponse } from "@vercel/node";
import { getRoom, setRoom, type RoomMeta, type RoomAction } from "./_store";

// 30-day TTL
const ROOM_TTL = 30 * 24 * 60 * 60 * 1000;

// Generate a short room code (8 chars, alphanumeric)
function generateCode(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Generate a per-device secret token
function generateSecret(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const pathname = req.url ? new URL(req.url, "http://localhost").pathname : "";
  const match = pathname.match(/^\/api\/rooms\/(.+?)(?:\/(\w+))?$/) || [];
  const code = match[1];
  const action = match[2];

  if (!code) {
    // POST /api/rooms - create a new room
    if (req.method === "POST" && !action) {
      const { seed, theme } = req.body || {};
      if (typeof seed !== "number") return res.status(400).json({ error: "seed required" });

      const newCode = generateCode();
      const secret = generateSecret();
      const meta: RoomMeta = {
        v: 1,
        created: Date.now(),
        players: [{ seat: 0, name: "", secret }],
        seed,
        ...(theme && { theme }),
      };

      await setRoom(newCode, { meta, actions: [] });
      return res.status(201).json({ code: newCode, seat: 0, secret });
    }
    return res.status(405).json({ error: "method not allowed" });
  }

  // GET /api/rooms/<code> - get room state
  if (req.method === "GET" && !action) {
    const room = getRoom(code);
    if (!room) return res.status(404).json({ error: "room not found" });

    // Check if room is expired
    if (Date.now() - room.meta.created > ROOM_TTL) {
      // TODO: delete room
      return res.status(410).json({ error: "room expired" });
    }

    return res.status(200).json(room);
  }

  // POST /api/rooms/<code>/join - join as a player
  if (req.method === "POST" && action === "join") {
    const { name } = req.body || {};
    if (typeof name !== "string") return res.status(400).json({ error: "name required" });

    const room = getRoom(code);
    if (!room) return res.status(404).json({ error: "room not found" });

    // Find free seat or create as spectator
    const seats = [0, 1] as const;
    let seat: 0 | 1 | null = null;
    for (const s of seats) {
      if (!room.meta.players.some((p) => p.seat === s)) {
        seat = s;
        break;
      }
    }

    if (seat === null) {
      return res.status(200).json({ seat: null, secret: null, message: "room full, joining as spectator" });
    }

    const secret = generateSecret();
    room.meta.players.push({ seat, name, secret });
    await setRoom(code, room);

    return res.status(200).json({ seat, secret });
  }

  // POST /api/rooms/<code>/action - append an action
  if (req.method === "POST" && action === "action") {
    const { seat, secret, actionIndex, actionType, actionData } = req.body || {};
    if (typeof seat !== "number" || typeof secret !== "string" || typeof actionIndex !== "number" || (seat !== 0 && seat !== 1)) {
      return res.status(400).json({ error: "invalid request" });
    }
    const seatNum = seat as 0 | 1;

    const room = getRoom(code);
    if (!room) return res.status(404).json({ error: "room not found" });

    // Verify seat and secret
    const player = room.meta.players.find((p) => p.seat === seatNum && p.secret === secret);
    if (!player) return res.status(403).json({ error: "unauthorized" });

    // Validate action index (must match current length)
    if (actionIndex !== room.actions.length) {
      return res.status(409).json({ error: "conflict", expectedIndex: room.actions.length });
    }

    const newAction: RoomAction = { i: actionIndex, t: actionType as "base" | "flick", seat: seatNum, data: actionData };
    room.actions.push(newAction);
    await setRoom(code, room);

    return res.status(200).json({ success: true });
  }

  return res.status(404).json({ error: "not found" });
}
