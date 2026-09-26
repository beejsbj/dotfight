// The rules card for each rule set: short, in the voice of a friend writing
// the rules down for you. Plain strings (a little <b> markup), so any look can
// show them.

import type { RuleSet, Shape } from "./rules";

export const SHAPE_NAMES: Record<Shape, string> = { circle: "camp", tri: "prism", square: "fort", hex: "mirror" };
/** A shape's name under these rules (a hexagon that banks everyone's ink is a cushion, not a mirror). */
export const shapeName = (R: RuleSet, sh: Shape) => (sh === "hex" && R.shapes.hex.wall === "bank" ? "cushion" : SHAPE_NAMES[sh]);

export interface Card { rules: string[]; feel?: string }

const FLICK = "On your go, flick one soldier: <b>shoot</b> (he stays put) or <b>move</b> (he goes where the ink stops). Both lines are just as long, and both cross out every enemy they touch.";
const SEND = "Or <b>send</b> up to 5 from one base to another. They walk the road and arrive after your opponent's next go. If an enemy line crosses the road first, they're all dead.";
const STREAK = "Cross someone out? Flick again, up to two extra flicks a turn. (Not on the very first turn of the game.)";

/** The margin note on each round-2 card. */
export const FEELS: Record<string, string> = {};

const n = (k: number) => ["no", "one", "two", "three", "four", "five", "six"][k] ?? String(k);

/**
 * A round-2 card, written from the rules themselves so it can't drift from
 * them while they're tuned.
 */
export function round2Card(R: RuleSet, feel?: string): Card {
  const rules: string[] = [];
  const I = R.ink;
  if (R.kit) {
    const count = (sh: Shape) => R.kit!.filter((k) => k === sh).length;
    const parts = (["circle", "tri", "hex", "square"] as Shape[]).filter((sh) => count(sh)).map((sh) => {
      const c = count(sh), name = shapeName(R, sh);
      const what = { circle: "circles", tri: "triangles", hex: "hexagons", square: "squares" }[sh];
      const one = { circle: "circle", tri: "triangle", hex: "hexagon", square: "square" }[sh];
      const dots = sh === "circle" ? R.soldiersPerBase : R.shapes[sh].soldiers;
      return c > 1 ? `${n(c)} <b>${name}s</b> (${what}, ${dots})` : `a <b>${name}</b> (${one}, ${dots})`;
    });
    rules.push(`Draw ${parts.slice(0, -1).join(", ")} and ${parts.at(-1)} each, in any order.`);
    if (R.shapes.circle.wobble === 0 && Object.values(R.shapes).some((x) => (x.wobble ?? 0) > 0)) rules.push("Camps have soft walls. Lines going through a prism's or cushion's wall get a jolt.");
    if (R.shapes.hex.wall === "bank") rules.push("A line that <b>glances</b> off a cushion's wall bounces away, angle in = angle out. Anyone's line, yours too. Come in straight and it goes through.");
    if (R.shapes.tri.prism) rules.push("Any shot of yours passing out through your own prism splits in two.");
  } else rules.push(`${n(R.basesPerPlayer)[0].toUpperCase() + n(R.basesPerPlayer).slice(1)} bases each, ${R.soldiersPerBase} dots in each.`);
  if (R.position) rules.push(`Before the first flick, drag your soldiers where you want them: in their base or just outside it.`);
  rules.push("On your go, flick one soldier: <b>snipe</b> (he stays put) or <b>lunge</b> (he goes where the ink stops). Both lines are as long, and cross out every enemy they touch.");
  if (R.earn) {
    if (R.earn.shoot) rules.push(R.earn.rise
      ? `Snipe <b>${n(R.earn.shoot)} with one line</b>? Flick again. The next snipe needs ${n(R.earn.shoot + R.earn.rise)} to go again, then ${n(R.earn.shoot + 2 * R.earn.rise)}, and so on.`
      : `Snipe <b>${n(R.earn.shoot)} with one line</b>? Flick again${R.chainCap ? "" : ", for as long as you keep doing it"}.`);
    if (R.earn.move) rules.push(`Lunge through someone? ${R.earn.sameMover ? "He" : "You"} can lunge again, with a shakier hand each time. Or stop.`);
  }
  if (R.chainCap) rules.push(`No more than ${n(R.chainCap)} extra flicks a turn.`);
  if (R.lunge?.baseDeath) rules.push("Lunge into their base (while anyone's in it) and he dies at the wall. Off the page, too.");
  if (R.transfer) {
    const T = R.transfer;
    rules.push(`<b>Send</b> up to ${T.max} from one of your bases to another${T.free ? ", free, once a turn" : " instead of flicking"}. ${T.pace ? "They walk the page, and any line that touches one crosses him out." : "They arrive after your opponent's next go."}`);
  }
  if (R.empty !== "gone") rules.push(`An emptied base stays on the page${R.empty === "crumble" ? ", its walls crumbled" : ""}. Walk${R.transfer?.refill && R.transfer.refill !== "none" ? " or send" : ""} someone in to man it again${R.capture ? " (theirs too: then it's yours)" : ""}.`);
  const ink: string[] = [];
  if (I.wobble) ink.push("Crossing a line <b>jolts</b> your hand: the line wobbles on from there.");
  if (I.boost || I.drag) ink.push(`Crossing your own line ${I.boost ? "carries you further" : "does nothing"}; crossing theirs ${I.drag ? "slows you down" : "does nothing"}.`);
  if (I.groove) ink.push(`Meet a line nearly parallel and it <b>pulls</b> your pen into its groove, harder the slower you're going.${(I.grooveOwn ?? 1) < 1 || (I.grooveEnemy ?? 1) > 1 ? " Your grooves carry you further, theirs cut you short." : ""}`);
  if (I.scribble) ink.push(`Scribbles are cover: a line crossing ${n(I.scribble)} lines in a short stretch soaks in and stops.`);
  if (I.taperHit || I.taperWall) ink.push(`Every ${[I.taperHit && "soldier crossed out", I.taperWall && "wall passed"].filter(Boolean).join(" and every ")} takes a bit off what's left of the line.`);
  if (!R.kit && R.shapes.circle.wobble) ink.push("Base walls jolt a line going through them.");
  rules.push(...ink);
  if (R.lastStand) rules.push(`<b>Last stand:</b> down to ${R.lastStand.at}, a side flicks ${n(R.lastStand.shots)} times a turn with a steadier hand.`);
  rules.push(R.win === "bases" ? "Leave them no manned base to win." : "Cross out every enemy soldier to win.");
  return { rules, feel };
}

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
