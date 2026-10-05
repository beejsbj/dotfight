// Little hand-drawn glyphs for the cover, as inline SVG strings. They draw with
// currentColor, so the slip's ink or pencil decides the colour. Pure, tested.

import type { Theme } from "./theme";

const svg = (w: number, h: number, body: string, cls: string) =>
  `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** A torn scrap of a paper: its colour, its ruling or grid, its margin line, in its own inks. */
export function paperIcon(paper: Theme["paper"], tilt = 0): string {
  const ink = paper.bold || paper.line;
  let rules = "";
  if (paper.lines !== "none") {
    for (let y = 11; y <= 25; y += 4) rules += `<path d="M3 ${y}h20" stroke="${ink}" stroke-width="1.1"/>`;
    if (paper.lines === "squared" || paper.lines === "graph") for (let x = 8; x <= 21; x += 4) rules += `<path d="M${x} 7v19" stroke="${ink}" stroke-width="1.1"/>`;
  }
  return `<svg class="paper-icon" viewBox="0 0 26 30" width="26" height="30" style="transform:rotate(${tilt}deg)" aria-hidden="true" focusable="false">
    <path d="M2 5.5 5 3.8 8 5.6 11 3.6 14 5.4 17 3.9 20 5.5 24 4.2 23.6 26 24.4 27.4 3 27.8 2.4 26Z" fill="${paper.colour}" stroke="rgba(40,30,20,.55)" stroke-width="1.2" stroke-linejoin="round"/>
    ${rules}<path d="M6.5 5v22" stroke="${paper.margin}" stroke-width="1.4"/></svg>`;
}

/** A page ripped across: the strike that says it goes. */
export const tearIcon = () => svg(30, 30, `<path d="M6 4h12l6 6v16H6z"/><path d="M2 17l4-3 4 4 4-4 4 4 4-4 4 3" stroke-width="2.6"/>`, "hand-icon");

/** A hand-drawn tick: keep it. */
export const keepIcon = () => svg(30, 30, `<path d="M5 16c3 2 5 5 7 8 4-9 8-15 14-19"/>`, "hand-icon");

/** How Dawood-bot flicks, as the stroke that underlines the word: a wobble, a ruled line, a line that finds its mark. */
export const levelIcon = (level: 0 | 1 | 2) => svg(60, 14, [
  `<path d="M2 8c3-8 6-8 8 0s5 6 7-1 5-7 7 0 4 5 7-1 5-6 7 0 4 4 7-1 5-4 9-2"/>`,
  `<path d="M2 8c18-2 38-3 56-3"/>`,
  `<path d="M2 10 55 5"/><path d="M47 1.5 56 5 48 10.5" stroke-width="2.4"/>`,
][level], "hand-icon");
