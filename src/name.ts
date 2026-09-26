// The game's name, in one place: a rename is coming. HTML pages get it
// through `%GAME_NAME%` / `%GAME_NAME_HTML%` (see vite.config.ts); code
// imports it from here.

export const GAME = {
  name: "Pen Flick Tactics",
  short: "Pen Flick",
};

/** The name for a title: the last word in the other pen's ink, as on the book's label. */
export function nameHtml(name = GAME.name) {
  const i = name.lastIndexOf(" ");
  return i < 0 ? `<em>${name}</em>` : `${name.slice(0, i)} <em>${name.slice(i + 1)}</em>`;
}
