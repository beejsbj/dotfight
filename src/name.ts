// The game's name, in one place. "Margin Front" is a working title (chosen
// 2026-09-26 over "Paper War", which other store games already use); it may
// still change before release.
// HTML pages get it through `%GAME_NAME%` / `%GAME_NAME_HTML%` (see
// vite.config.ts); code imports it from here; public/manifest.webmanifest
// is checked against it by a test. The repo, domain and Vercel project keep
// the old name, pen-flick-tactics.

export const GAME = {
  name: "Margin Front",
  short: "Margin Front",
};

/** The name for a title: the last word in the other pen's ink, as on the book's label. */
export function nameHtml(name = GAME.name) {
  const i = name.lastIndexOf(" ");
  return i < 0 ? `<em>${name}</em>` : `${name.slice(0, i)} <em>${name.slice(i + 1)}</em>`;
}
