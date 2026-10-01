import { expect, it } from "vitest";
import { walkerAt } from "./timeline";

it("a walker's displayed position starts at departure, eases and bobs, then arrives", () => {
  const a = { x: 10, y: 20 }, b = { x: 110, y: 120 };
  expect(walkerAt(a, b, 0)).toEqual(a);
  expect(walkerAt(a, b, 1)).toEqual(b);
  expect(walkerAt(a, b, 0.25).x).toBe(25.625);
  expect(walkerAt(a, b, 0.5).y).toBeCloseTo(68.75);
});
