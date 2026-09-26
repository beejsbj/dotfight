import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { guardBrowserJob } from "./lib/guarded-browser.mjs";
await guardBrowserJob();

// Scripted playtests at phone size with real touch events (CDP).
// Usage: node scripts/playtest.mjs <scenario> [url] [outdir]
//   scenarios live in scripts/scenarios/<name>.mjs and export default async (T, outDir)
// Needs the dev server (window.pft is dev-only) and Chrome.
// Env: W, H, DPR (viewport), PFT_ARGS (extra Chrome flags), THROTTLE (CPU slowdown).
import { mkdirSync } from "node:fs";
import { phone } from "./lib/phone.mjs";

const scenario = process.argv[2];
if (!scenario) throw new Error("usage: node scripts/playtest.mjs <scenario> [url] [outdir]");
const url = process.argv[3] ?? "http://localhost:5173/";
const out = process.argv[4] ?? (hostname().split(".")[0] === "bjslab" ? "/mnt/server-ssd/t3-test-artifacts/dotfight" : join(tmpdir(), "pft-playtest"));
mkdirSync(out, { recursive: true });
const T = await phone({ url, w: +(process.env.W ?? 390), h: +(process.env.H ?? 844), dpr: +(process.env.DPR ?? 3), taught: process.env.TAUGHT !== "0" });
try {
  const mod = await import(`./scenarios/${scenario}.mjs`);
  await mod.default(T, out);
} finally {
  if (T.logs.length) console.log(T.logs.filter((l) => !l.includes("[vite]")).join("\n"));
  await T.browser.close();
}
