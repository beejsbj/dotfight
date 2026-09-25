// The rules card for each rule set: short, in the voice of a friend writing
// the rules down for you. Plain strings, so any look can show them.

import type { Shape } from "./rules";

export const SHAPE_NAMES: Record<Shape, string> = { circle: "camp", tri: "prism", square: "fort", hex: "mirror" };

export interface Card { rules: string[]; feel?: string }

export const CARDS: Record<string, Card> = {
  classic: {
    rules: [
      "Take turns drawing 5 bases each. 10 dots in every base.",
      "On your go, flick one soldier: <b>shoot</b> (he stays) or <b>move</b> (he goes where the ink stops). Both lines are just as long, and both cross out every enemy they touch.",
      "Cross someone out? Flick again.",
      "Or <b>send</b> up to 5 from one base to another. They walk the road and arrive after your opponent's next go. If an enemy line cuts the road on the way, they're all dead.",
      "An empty base is gone for good. No new soldiers, ever.",
      "Cross out every enemy soldier to win.",
    ],
    feel: "the canon, with the gaps guessed",
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
