// The rules card for each rule set: short, in the voice of a friend writing
// the rules down for you. Plain strings (a little <b> markup), so any look can
// show them.

import type { Shape } from "./rules";

export const SHAPE_NAMES: Record<Shape, string> = { circle: "camp", tri: "prism", square: "fort", hex: "mirror" };

export interface Card { rules: string[]; feel?: string }

const FLICK = "On your go, flick one soldier: <b>shoot</b> (he stays put) or <b>move</b> (he goes where the ink stops). Both lines are just as long, and both cross out every enemy they touch.";
const SEND = "Or <b>send</b> up to 5 from one base to another. They walk the road and arrive after your opponent's next go. If an enemy line crosses the road first, they're all dead.";
const STREAK = "Cross someone out? Flick again, up to two extra flicks a turn. (Not on the very first turn of the game.)";

export const CARDS: Record<string, Card> = {
  classic: {
    rules: [
      "Take turns drawing 5 bases each. 10 dots in every base.",
      FLICK,
      "Cross someone out? Flick again, for as long as you keep crossing them out.",
      SEND,
      "An empty base is gone for good. No new soldiers, ever.",
      "Cross out every enemy soldier to win.",
    ],
    feel: "Dawood's rules, with the gaps guessed",
  },
  "last-stand": {
    rules: [
      "5 bases each, 10 dots in each.",
      FLICK,
      STREAK,
      "<b>Last stand:</b> when a side is down to 4, its survivors get circled. From then on that side flicks <b>twice</b> every turn, with a steadier hand.",
      SEND,
      "Cross out every enemy soldier to win.",
    ],
    feel: "Burooj's idea: they lost their comrades",
  },
  geometry: {
    rules: [
      "Draw 5 bases each: 2 <b>camps</b> (circles, 10 dots), a <b>fort</b> (square, 8), a <b>mirror</b> (hexagon, 8) and a <b>prism</b> (triangle, 6).",
      "A fort's wall stops an enemy line dead, once. Then that wall is cracked open.",
      "A mirror's wall bounces an enemy line away, once. Then that wall is cracked.",
      "Your own line leaving your own prism splits in two.",
      FLICK,
      STREAK,
      "Cross out every enemy soldier to win.",
    ],
    feel: "shapes with properties, after Burooj",
  },
  "wet-ink": {
    rules: [
      "5 bases each, 10 dots in each.",
      FLICK,
      "The newest line in each colour is still <b>wet</b> (it shines a little).",
      "Your line hits your own wet line: it bounces off. It hits their wet line: it stops.",
      "Older lines have dried. They stay on the page but don't get in the way.",
      STREAK,
      "Cross out every enemy soldier to win.",
    ],
    feel: "lines as walls and mirrors, without choking the page",
  },
  siege: {
    rules: [
      "5 bases each, 10 dots in each.",
      FLICK,
      STREAK,
      "A base with none of your soldiers standing in it has <b>fallen</b>. Leave them no standing base and you win.",
      "Move a soldier into a fallen base, anyone's, and it's yours: circle it again.",
      "Before your flick you may <b>send</b> up to 5 down one road. It doesn't cost your flick. They arrive after your opponent's next go; if an enemy line crosses the road first, they're all dead.",
    ],
    feel: "bases are everything; no hunting the last dot",
  },
  prototype: {
    rules: [
      "3 bases each, 10 dots in each.",
      "Shoot: a long line, you stay put. Move: a short line, you go where it stops.",
      "One flick a turn. Cross out every enemy to win.",
    ],
    feel: "what the first build guessed, before Dawood",
  },
};
