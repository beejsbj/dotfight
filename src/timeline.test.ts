import { expect, it } from "vitest";
import { signable, walkerAt } from "./timeline";

it("a walker's displayed position starts at departure, eases and bobs, then arrives", () => {
  const a = { x: 10, y: 20 }, b = { x: 110, y: 120 };
  expect(walkerAt(a, b, 0)).toEqual(a);
  expect(walkerAt(a, b, 1)).toEqual(b);
  expect(walkerAt(a, b, 0.25).x).toBe(25.625);
  expect(walkerAt(a, b, 0.5).y).toBeCloseTo(68.75);
});

it("a won page is not signed by the winning flick, only once its finale starts (or when merely looked at)", () => {
  expect(signable("game", false)).toBe(false); // the last flick is still being drawn
  expect(signable("replay", false)).toBe(false); // the replay's last step lands before its sunrise
  expect(signable("game", true)).toBe(true);
  expect(signable("replay", true)).toBe(true);
  expect(signable("view", false)).toBe(true); // a page out of the drawer: already signed
});
