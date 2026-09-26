// The game's name, in one place: Dotfight (chosen 2026-09-26; the repo,
// Vercel project and domain are dotfight too). HTML pages get it through
// `%GAME_NAME%` / `%GAME_NAME_HTML%` (see vite.config.ts); code imports it
// from here; public/manifest.webmanifest is checked against it by a test.

export const GAME = {
  name: "Dotfight",
  short: "Dotfight",
  url: "https://dotfight.vercel.app",
  /** Where the title splits between the two pens: "Dot" in blue, "fight" in red. */
  split: 3,
};

/** The name for a title: the second part in the other pen's ink, as on the book's label. */
export function nameHtml(name = GAME.name, split = name === GAME.name ? GAME.split : undefined) {
  if (split !== undefined) return `${name.slice(0, split)}<em>${name.slice(split)}</em>`;
  const i = name.lastIndexOf(" ");
  return i < 0 ? `<em>${name}</em>` : `${name.slice(0, i)} <em>${name.slice(i + 1)}</em>`;
}
