// Run JS in the page served by scripts/vite.remote.config.ts: node scripts/remote-eval.mjs '<js>' [server]
const [code, server = process.env.REMOTE] = process.argv.slice(2);
if (!server) throw new Error("usage: REMOTE=http://<phone-host>:<port> node scripts/remote-eval.mjs '<js>' (or pass the server as the second argument)");
const r = await fetch(`${server}/__remote/eval`, { method: "POST", body: code });
console.log(await r.text());
