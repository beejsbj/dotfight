// Run JS in the page served by scripts/vite.remote.config.ts: node scripts/remote-eval.mjs '<js>' [server]
const [code, server = process.env.REMOTE ?? "http://100.88.219.36:5243"] = process.argv.slice(2);
const r = await fetch(`${server}/__remote/eval`, { method: "POST", body: code });
console.log(await r.text());
