import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { GAME, nameHtml } from "./src/name.ts";

const root = import.meta.dirname;

// In dev, answer /api/room with the same handler Vercel runs. The store comes
// from KV_* / UPSTASH_REDIS_* in the environment or a git-ignored .env*.local
// (`vercel env pull .env.development.local`).
function roomApi(): Plugin {
  return {
    name: "room-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, root, ["KV_", "UPSTASH_"]);
      for (const [k, v] of Object.entries(env)) process.env[k] ??= v;
      server.middlewares.use("/api/room", async (req, res) => {
        try {
          const mod = await server.ssrLoadModule("/api/room.ts");
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const url = new URL(req.originalUrl ?? req.url ?? "/", "http://localhost");
          const r: Response = await mod[req.method === "POST" ? "POST" : "GET"](
            new Request(url, { method: req.method, headers: req.headers as HeadersInit, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }),
          );
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    roomApi(),
    {
      // one place for the game's name: HTML pages write %GAME_NAME%
      name: "game-name",
      transformIndexHtml: {
        order: "pre",
        handler: (html) =>
          html.replaceAll("%GAME_NAME_HTML%", nameHtml()).replaceAll("%GAME_SHORT%", GAME.short).replaceAll("%GAME_NAME%", GAME.name),
      },
    },
  ],
  build: {
    rollupOptions: {
      input: { main: resolve(root, "index.html"), rules: resolve(root, "rules.html"), advanced: resolve(root, "rules/advanced.html") },
    },
  },
});
