// A playtest scenario in a Chrome already running elsewhere (a real GPU, e.g.
// the Mac), reached over CDP: CDP=http://127.0.0.1:9333 node scripts/remote-playtest.mjs <scenario> <url> <out>
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { phone } from "./lib/phone.mjs";

const [scenario, url, out = "/tmp/remote-playtest"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(process.env.CDP ?? "http://127.0.0.1:9333");
const T = await phone({ url, browser, w: +(process.env.W ?? 411), h: +(process.env.H ?? 856), dpr: +(process.env.DPR ?? 2.625), taught: true });
try {
  await (await import(`./scenarios/${scenario}.mjs`)).default(T, out);
} finally {
  if (T.logs.length) console.log(T.logs.filter((l) => !l.includes("[vite]")).slice(-30).join("\n"));
  await T.page.context().close();
  await browser.close();
}
