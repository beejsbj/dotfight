// The dev server plus a remote-eval channel, for looking inside the game on a
// real phone: the page polls /__remote/cmd and posts results back, and
// `node scripts/remote-eval.mjs '<js>'` runs code there.
//   npx vite --config scripts/vite.remote.config.ts --host <tailscale ip>
import { mergeConfig, type Plugin } from "vite";
import base from "../vite.config.ts";

function remote(): Plugin {
  const queue: { id: number; code: string }[] = [];
  const waiting = new Map<number, (v: string) => void>();
  let polls: ((c: string) => void)[] = [];
  let next = 1;
  const body = (req: import("node:http").IncomingMessage) => new Promise<string>((ok) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => ok(b)); });
  const flush = () => { while (queue.length && polls.length) polls.shift()!(JSON.stringify(queue.shift())); };
  return {
    name: "remote-eval",
    transformIndexHtml: (html) => html.replace("</body>", `<script>
(async () => {
  for (;;) {
    try {
      const r = await fetch("/__remote/cmd");
      if (r.status !== 200) { await new Promise((ok) => setTimeout(ok, 500)); continue; }
      const { id, code } = await r.json();
      let out;
      try { out = { value: await (0, eval)(code) }; } catch (e) { out = { error: String(e && e.stack || e) }; }
      let text; try { text = JSON.stringify(out); } catch (e) { text = JSON.stringify({ error: "unserialisable: " + e }); }
      await fetch("/__remote/result?id=" + id, { method: "POST", body: text });
    } catch { await new Promise((ok) => setTimeout(ok, 1000)); }
  }
})();
</script></body>`),
    configureServer(server) {
      server.middlewares.use("/__remote", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://x");
        if (url.pathname === "/cmd") {
          const t = setTimeout(() => { polls = polls.filter((p) => p !== send); res.statusCode = 204; res.end(); }, 20000);
          const send = (c: string) => { clearTimeout(t); res.setHeader("content-type", "application/json"); res.end(c); };
          polls.push(send); flush(); return;
        }
        if (url.pathname === "/result") { waiting.get(+url.searchParams.get("id")!)?.(await body(req)); waiting.delete(+url.searchParams.get("id")!); res.end("ok"); return; }
        if (url.pathname === "/eval") {
          const id = next++, code = await body(req);
          const t = setTimeout(() => { waiting.delete(id); res.statusCode = 504; res.end('{"error":"no page answered"}'); }, 60000);
          waiting.set(id, (v) => { clearTimeout(t); res.end(v); });
          queue.push({ id, code }); flush(); return;
        }
        res.statusCode = 404; res.end();
      });
    },
  };
}

export default mergeConfig(base, { plugins: [remote()] });
