// The long-bot war, with a count of what the bot's Web Worker did: it must be
// started, and answer the bot's moves (the human seat's moves in that scenario
// are worked out on the page, so only the bot's seat should show up here).
import longBot from "./long-bot.mjs";

export default async function (T, out) {
  const { page } = T;
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.evaluate(() => {
    const Real = window.Worker;
    window.__bot = { started: 0, answered: 0, failed: 0 };
    window.Worker = class extends Real {
      constructor(...a) {
        super(...a);
        window.__bot.started++;
        this.addEventListener("message", () => window.__bot.answered++);
        this.addEventListener("error", () => window.__bot.failed++);
      }
    };
  });
  await longBot(T, out);
  const bot = await page.evaluate(() => window.__bot);
  const state = await T.state();
  console.log("bot worker", JSON.stringify(bot), "phase", state.phase, "turn", state.turn, "page errors", errors.length);
  if (errors.length) console.log(errors.join("\n"));
  if (!bot.started || !bot.answered || bot.failed || errors.length) throw new Error("the bot's worker did not carry the war");
}
