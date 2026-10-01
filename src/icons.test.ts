import { describe, expect, it } from "vitest";
import { keepIcon, paperIcon, tearIcon } from "./icons";
import { THEMES } from "./theme";

describe("cover icons", () => {
  it("draws each paper in its own colour, ruling and margin", () => {
    for (const t of THEMES) {
      const svg = paperIcon(t.paper);
      expect(svg, t.id).toContain(t.paper.colour);
      expect(svg, t.id).toContain(t.paper.margin);
      if (t.paper.lines === "none") expect(svg, t.id).not.toContain(t.paper.bold);
      else expect(svg, t.id).toContain(t.paper.bold || t.paper.line);
    }
  });
  it("ruled paper has no verticals, squared and graph paper do", () => {
    const by = (l: string) => THEMES.find((t) => t.paper.lines === l);
    const vertical = (s: string) => /M\d+ 7v19/.test(s);
    if (by("ruled")) expect(vertical(paperIcon(by("ruled")!.paper))).toBe(false);
    if (by("squared")) expect(vertical(paperIcon(by("squared")!.paper))).toBe(true);
  });
  it("the buttons' glyphs are inline SVG in the current colour", () => {
    for (const s of [tearIcon(), keepIcon()]) { expect(s).toMatch(/^<svg/); expect(s).toContain("currentColor"); }
  });
});
