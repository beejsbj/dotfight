// Themes: which paper the war is fought on, which pens, which desk, which light.
//
// A theme is data. The renderer (ink, page, textures, light, pen, scene), the
// HUD's CSS and the pen sounds read the tokens of the theme in force; camera,
// gestures and rules never look at them.
//
// Which theme you get:
// - In a room, the room's paper wins. A room link is the same sheet for both
//   players, so it has to be the same paper; your own pick is kept for later
//   and the cover says which paper the room is on.
// - Otherwise a theme you chose in settings.
// - Otherwise a surprise: a fresh random seed on every load, never the same
//   paper twice running.
// A page remembers the paper it was started on (`page.theme` in its stamp), so
// resuming, the drawer and replays show it as it was played.
//
// For the room link: store `currentTheme()` in the room's meta when you make
// a room (or derive one with `themeFromSeed(roomSeed)`), call
// `setRoomTheme(meta.theme)` when a player joins, and `setRoomTheme()` when
// they leave.
//
// Pure apart from `applyTheme`, `chooseTheme` and `setRoomTheme`, which touch
// the DOM and localStorage only when those exist.

export type RGB = [number, number, number];
/** Multiply stops for a light: distance from the pool's centre (0..1), then the colour that survives. */
export type Stops = [number, RGB][];

export interface Theme {
  id: string;
  /** Shown in settings. */
  name: string;
  /** One line under the name in settings. */
  blurb: string;
  cover: {
    /** Printed across the top of the cover label. */
    school: string;
    /** The Class field: the theme's name, said the way a kid would. */
    klass: string;
    /** The cover board, and the label stuck on it. */
    book: string;
    label: string;
    labelInk: string;
    /** The hand-lettered title, in these two inks. */
    title: [string, string];
  };
  paper: {
    colour: string;
    lines: "squared" | "ruled" | "graph" | "none";
    line: string;
    bold: string;
    /** Distance between lines; for graph paper the fine step (bold every `every`). */
    step: number;
    every: number;
    /** Where the lines start (below the header). */
    top: number;
    margin: string;
    marginStyle: "single" | "double" | "pencil" | "frame";
    /** Printed header words, and where each sits (page units). */
    print: string;
    labels: [string, number, number][];
    /** Where the page number and date are written in. */
    noAt: [number, number];
    dateAt: [number, number];
    /** 0..1: how much tooth the sheet has. */
    grain: number;
    foxing: string;
    extra: "none" | "staples" | "gum" | "showthrough" | "titleblock";
    /** What a long war ages the sheet toward (multiply), and how far. */
    age: RGB;
    ageK: number;
  };
  ink: {
    pens: [string, string];
    names: [string, string];
    /** The pen's barrel (a pencil's paint); usually the ink. */
    body: [string, string];
    tool: "ballpoint" | "gel" | "pencil";
    /** Line width, the resting blob, the gloss while wet, dry skips, graphite tooth. */
    width: number;
    wet: number;
    gloss: number;
    skip: number;
    grain: number;
    /** How marks land on the paper: dark ink multiplies, light ink on dark paper screens. */
    blend: "multiply" | "screen";
    /** The pencil used for guides and notes. */
    lead: RGB;
  };
  desk: {
    kind: "walnut" | "felt" | "school" | "mahogany" | "birch" | "mat" | "gingham";
    /** Dark and light of the surface, and an accent (blotter, check, grid...). */
    a: RGB;
    b: RGB;
    accent: RGB;
  };
  light: {
    lamp: Stops;
    /** The end of a war: morning. */
    day: Stops;
    /** The room before the light comes on. */
    off: RGB;
    /** How wide the pool is. */
    reach: number;
    /** The aiming fog's colour: the room beyond the light. */
    fog: RGB;
    /** The standing pen in shadow, and the lamp's warmth on it (rgb + alpha). */
    shade: RGB;
    warm: [number, number, number, number];
    sheen: RGB;
    shadow: RGB;
    /** How the light comes on at the title. */
    switch: "lamp" | "tube" | "day";
  };
  hud: {
    /** The paper scraps: cards, the menu slip, the move/shoot cards. */
    paper: string;
    lines: "squared" | "ruled" | "graph" | "none";
    line: string;
    margin: string;
    ink: string;
    fine: string;
    /** The name tags stuck to the desk. */
    tape: string;
    /** Pen colours for writing on the HUD's paper. */
    pens: [string, string];
    /** Words lying straight on the desk (status, the round tabs), and their shadow. */
    desk: RGB;
    deskShadow: string;
  };
  sound: {
    /** Pen-on-paper scratch: pitch and resonance multipliers, loudness. */
    pitch: number;
    q: number;
    gain: number;
  };
}

// The lamp as Lamplight had it: tungsten, falling off into a dark room.
const TUNGSTEN: Stops = [[0, [255, 248, 232]], [0.36, [246, 226, 192]], [0.66, [176, 138, 102]], [0.88, [84, 64, 50]], [1, [40, 31, 25]]];
const MORNING: Stops = [[0, [250, 251, 253]], [0.42, [242, 244, 247]], [0.7, [208, 212, 220]], [0.9, [150, 156, 168]], [1, [104, 110, 124]]];

const LAMPLIGHT: Theme = {
  id: "lamplight",
  name: "Maths copy",
  blurb: "the squared back pages, under the desk lamp",
  cover: { school: "EXERCISE BOOK · SQUARED", klass: "after lights out", book: "#9a6f45", label: "#fbf8f0", labelInk: "#3a5fa8", title: ["#1b3899", "#c01e2a"] },
  paper: {
    colour: "#f3efe4", lines: "squared", line: "rgba(84, 128, 168, 0.30)", bold: "rgba(84, 128, 168, 0.42)", step: 25, every: 0, top: 100,
    margin: "rgba(200, 64, 64, 0.5)", marginStyle: "single",
    print: "rgba(84, 128, 168, 0.75)", labels: [["Page No. ________", 92, 66], ["Date ______________", 738, 66]], noAt: [188, 60], dateAt: [800, 60],
    grain: 1, foxing: "rgba(170, 130, 60, 0.07)", extra: "none", age: [236, 214, 170], ageK: 0.55,
  },
  ink: {
    pens: ["#1b3899", "#c01e2a"], names: ["Blue", "Red"], body: ["#1b3899", "#c01e2a"], tool: "ballpoint",
    width: 1, wet: 1, gloss: 1, skip: 1, grain: 0, blend: "multiply", lead: [58, 56, 54],
  },
  desk: { kind: "walnut", a: [58, 37, 25], b: [92, 59, 39], accent: [22, 12, 6] },
  light: {
    lamp: TUNGSTEN, day: MORNING, off: [16, 13, 12], reach: 1, fog: [40, 30, 22], shade: [22, 15, 10], warm: [255, 196, 120, 0.1],
    sheen: [255, 246, 225], shadow: [40, 28, 20], switch: "lamp",
  },
  hud: {
    paper: "#f3efe4", lines: "squared", line: "rgba(84, 128, 168, 0.28)", margin: "rgba(200, 64, 64, 0.45)", ink: "#3f3c39", fine: "#77726c",
    tape: "#e6d6ad", pens: ["#1b3899", "#c01e2a"], desk: [243, 236, 220], deskShadow: "rgba(0, 0, 0, 0.8)",
  },
  sound: { pitch: 1, q: 1, gain: 1 },
};

// PR #1's look: cream feint-ruled paper, a double red margin, a dark desk, flat light.
const NOTEBOOK: Theme = {
  id: "notebook",
  name: "The quiet notebook",
  blurb: "feint ruled, a double margin, flat light",
  cover: { school: "NOTEBOOK · FEINT RULED", klass: "the quiet one", book: "#3e5446", label: "#fbf8f0", labelInk: "#3f5f8a", title: ["#1f3a9e", "#c2252f"] },
  paper: {
    colour: "#f5f0e3", lines: "ruled", line: "rgba(92, 140, 196, 0.38)", bold: "rgba(92, 140, 196, 0.38)", step: 44, every: 0, top: 120,
    margin: "rgba(206, 70, 70, 0.55)", marginStyle: "double",
    print: "rgba(92, 140, 196, 0.7)", labels: [["No. ______", 100, 70], ["Date ____________", 750, 70]], noAt: [150, 64], dateAt: [812, 64],
    grain: 1, foxing: "rgba(170, 130, 60, 0.05)", extra: "none", age: [238, 222, 184], ageK: 0.45,
  },
  ink: {
    pens: ["#1f3a9e", "#c2252f"], names: ["Blue", "Red"], body: ["#1f3a9e", "#c2252f"], tool: "ballpoint",
    width: 1, wet: 1, gloss: 0.6, skip: 1, grain: 0, blend: "multiply", lead: [70, 68, 66],
  },
  desk: { kind: "felt", a: [36, 33, 31], b: [50, 46, 43], accent: [20, 18, 17] },
  light: {
    lamp: [[0, [255, 253, 248]], [0.4, [252, 249, 242]], [0.7, [242, 238, 230]], [0.9, [222, 216, 208]], [1, [196, 190, 182]]],
    day: [[0, [255, 254, 252]], [0.4, [253, 252, 250]], [0.7, [246, 245, 243]], [0.9, [230, 228, 226]], [1, [206, 204, 202]]],
    off: [30, 28, 26], reach: 1.5, fog: [43, 40, 37], shade: [30, 28, 26], warm: [255, 240, 220, 0.03],
    sheen: [255, 255, 255], shadow: [30, 28, 26], switch: "day",
  },
  hud: {
    paper: "#f5f0e3", lines: "ruled", line: "rgba(92, 140, 196, 0.34)", margin: "rgba(206, 70, 70, 0.5)", ink: "#4a4744", fine: "#7a756f",
    tape: "#efe8d6", pens: ["#1f3a9e", "#c2252f"], desk: [238, 232, 220], deskShadow: "rgba(0, 0, 0, 0.7)",
  },
  sound: { pitch: 1, q: 1, gain: 0.85 },
};

// The Pakistani school "copy": thin paper, pale blue rules, a pink margin,
// stapled through the spine, on a varnished school desk under a tube light.
const COPY: Theme = {
  id: "copy",
  name: "School copy",
  blurb: "thin blue rules, a pink margin, a tube light",
  cover: { school: "EXERCISE BOOK · 80 PAGES", klass: "7-B, tube light", book: "#2f7db4", label: "#fdfcf7", labelInk: "#2f6fa8", title: ["#2448b8", "#d3212d"] },
  paper: {
    colour: "#f3f4f0", lines: "ruled", line: "rgba(92, 148, 214, 0.46)", bold: "rgba(226, 96, 144, 0.5)", step: 36, every: 0, top: 104,
    margin: "rgba(228, 96, 146, 0.66)", marginStyle: "single",
    print: "rgba(92, 148, 214, 0.85)", labels: [["No. ______", 96, 66], ["Date ______________", 700, 66]], noAt: [140, 60], dateAt: [762, 60],
    grain: 0.55, foxing: "rgba(150, 150, 120, 0.035)", extra: "staples", age: [232, 222, 190], ageK: 0.5,
  },
  ink: {
    pens: ["#2448b8", "#d3212d"], names: ["Blue", "Red"], body: ["#2448b8", "#d3212d"], tool: "ballpoint",
    width: 0.85, wet: 0.8, gloss: 0.8, skip: 1.25, grain: 0, blend: "multiply", lead: [60, 62, 66],
  },
  desk: { kind: "school", a: [120, 78, 40], b: [172, 122, 68], accent: [36, 56, 140] },
  light: {
    lamp: [[0, [246, 252, 252]], [0.38, [238, 246, 246]], [0.68, [214, 224, 226]], [0.9, [168, 178, 182]], [1, [118, 126, 132]]],
    day: [[0, [252, 253, 252]], [0.42, [246, 248, 247]], [0.7, [226, 230, 230]], [0.9, [186, 192, 196]], [1, [140, 146, 152]]],
    off: [14, 16, 18], reach: 1.55, fog: [34, 40, 44], shade: [20, 26, 30], warm: [210, 240, 245, 0.06],
    sheen: [240, 252, 255], shadow: [30, 36, 40], switch: "tube",
  },
  hud: {
    paper: "#f3f4f0", lines: "ruled", line: "rgba(92, 148, 214, 0.42)", margin: "rgba(228, 96, 146, 0.55)", ink: "#3c3f44", fine: "#72767c",
    tape: "#e9dfbf", pens: ["#2448b8", "#d3212d"], desk: [240, 244, 242], deskShadow: "rgba(0, 0, 0, 0.75)",
  },
  sound: { pitch: 1.12, q: 1, gain: 0.9 },
};

// A yellow legal pad on a mahogany desk with a green blotter, under a banker's lamp.
const LEGAL: Theme = {
  id: "legal",
  name: "Legal pad",
  blurb: "canary yellow, black and red, a banker's lamp",
  cover: { school: "LEGAL PAD · 50 SHEETS", klass: "after hours", book: "#5c2320", label: "#fbf7ea", labelInk: "#2c3a55", title: ["#16161c", "#c4202a"] },
  paper: {
    colour: "#f7ea98", lines: "ruled", line: "rgba(80, 136, 160, 0.46)", bold: "rgba(80, 136, 160, 0.46)", step: 40, every: 0, top: 150,
    margin: "rgba(210, 46, 46, 0.62)", marginStyle: "double",
    print: "rgba(80, 136, 160, 0.8)", labels: [], noAt: [120, 118], dateAt: [770, 118],
    grain: 0.7, foxing: "rgba(160, 120, 40, 0.05)", extra: "gum", age: [236, 206, 128], ageK: 0.42,
  },
  ink: {
    pens: ["#17171d", "#c4202a"], names: ["Black", "Red"], body: ["#26262c", "#c4202a"], tool: "ballpoint",
    width: 1, wet: 1, gloss: 1, skip: 1, grain: 0, blend: "multiply", lead: [62, 60, 50],
  },
  desk: { kind: "mahogany", a: [62, 26, 18], b: [104, 48, 32], accent: [34, 70, 52] },
  light: {
    lamp: [[0, [255, 246, 220]], [0.34, [246, 228, 184]], [0.64, [168, 150, 104]], [0.86, [62, 70, 50]], [1, [24, 32, 24]]],
    day: MORNING, off: [10, 14, 11], reach: 0.95, fog: [26, 34, 26], shade: [16, 20, 14], warm: [255, 210, 140, 0.1],
    sheen: [255, 248, 220], shadow: [30, 26, 16], switch: "lamp",
  },
  hud: {
    paper: "#f7ea98", lines: "ruled", line: "rgba(80, 136, 160, 0.42)", margin: "rgba(210, 46, 46, 0.55)", ink: "#3d3a30", fine: "#6f6a58",
    tape: "#ece6d4", pens: ["#17171d", "#c4202a"], desk: [240, 234, 214], deskShadow: "rgba(0, 0, 0, 0.8)",
  },
  sound: { pitch: 0.95, q: 1, gain: 1 },
};

// A maths graph book, a pencil fight: HB lead against a red pencil, in daylight.
const GRAPH: Theme = {
  id: "graph",
  name: "Graph book",
  blurb: "a pencil fight on 2 mm squares, in daylight",
  cover: { school: "GRAPH BOOK · 2 MM", klass: "pencil fight", book: "#d4792a", label: "#fcfbf6", labelInk: "#2a7a60", title: ["#4a4a52", "#c8352f"] },
  paper: {
    colour: "#fafaf4", lines: "graph", line: "rgba(46, 140, 110, 0.16)", bold: "rgba(46, 140, 110, 0.36)", step: 10, every: 5, top: 100,
    margin: "rgba(46, 140, 110, 0.55)", marginStyle: "single",
    print: "rgba(46, 140, 110, 0.85)", labels: [["No. ______", 96, 66], ["Date ______________", 720, 66]], noAt: [140, 60], dateAt: [782, 60],
    grain: 0.5, foxing: "rgba(150, 140, 110, 0.03)", extra: "none", age: [236, 228, 200], ageK: 0.4,
  },
  ink: {
    pens: ["#46464e", "#c8352f"], names: ["Lead", "Red"], body: ["#efbd28", "#b8292a"], tool: "pencil",
    width: 1.2, wet: 0.3, gloss: 0.45, skip: 0.4, grain: 0.55, blend: "multiply", lead: [96, 96, 104],
  },
  desk: { kind: "birch", a: [186, 154, 110], b: [224, 198, 154], accent: [70, 70, 76] },
  light: {
    lamp: [[0, [255, 255, 253]], [0.4, [250, 250, 248]], [0.7, [234, 236, 238]], [0.9, [204, 208, 214]], [1, [170, 176, 186]]],
    day: [[0, [255, 255, 254]], [0.4, [253, 253, 252]], [0.7, [242, 243, 244]], [0.9, [222, 224, 228]], [1, [196, 200, 206]]],
    off: [70, 72, 78], reach: 1.7, fog: [150, 156, 168], shade: [40, 44, 52], warm: [255, 255, 255, 0],
    sheen: [255, 255, 255], shadow: [60, 62, 70], switch: "day",
  },
  hud: {
    paper: "#fafaf4", lines: "graph", line: "rgba(46, 140, 110, 0.22)", margin: "rgba(46, 140, 110, 0.5)", ink: "#44464c", fine: "#7a7c80",
    tape: "#e8dcb8", pens: ["#46464e", "#c8352f"], desk: [52, 42, 30], deskShadow: "rgba(255, 248, 235, 0.75)",
  },
  sound: { pitch: 0.7, q: 0.45, gain: 1.15 },
};

// A blueprint on a green cutting mat: white and yellow chalk pencil, an architect's lamp.
const BLUEPRINT: Theme = {
  id: "blueprint",
  name: "Blueprint",
  blurb: "white and yellow chalk on a drawing sheet",
  cover: { school: "DRAWING SHEETS · A2", klass: "drawing office", book: "#56687e", label: "#f7f9fc", labelInk: "#1d4f91", title: ["#1d4f91", "#d98f12"] },
  paper: {
    colour: "#1c4c8c", lines: "graph", line: "rgba(214, 230, 255, 0.10)", bold: "rgba(214, 230, 255, 0.22)", step: 25, every: 4, top: 100,
    margin: "rgba(232, 242, 255, 0.72)", marginStyle: "frame",
    print: "rgba(232, 242, 255, 0.8)", labels: [["DRG No.", 88, 66], ["DATE", 690, 66]], noAt: [196, 62], dateAt: [770, 62],
    grain: 0.8, foxing: "rgba(255, 255, 255, 0.035)", extra: "titleblock", age: [214, 218, 200], ageK: 0.35,
  },
  ink: {
    pens: ["#f2f6ff", "#ffc53d"], names: ["White", "Yellow"], body: ["#eef2f8", "#f2b92e"], tool: "pencil",
    width: 1.25, wet: 0.25, gloss: 0.15, skip: 0.5, grain: 0.4, blend: "screen", lead: [206, 224, 255],
  },
  desk: { kind: "mat", a: [30, 74, 60], b: [42, 92, 76], accent: [190, 232, 210] },
  light: {
    lamp: [[0, [250, 252, 255]], [0.38, [236, 242, 250]], [0.68, [164, 176, 194]], [0.88, [72, 80, 96]], [1, [30, 34, 44]]],
    day: MORNING, off: [8, 10, 14], reach: 1.05, fog: [14, 22, 36], shade: [10, 14, 22], warm: [200, 220, 255, 0.05],
    sheen: [255, 255, 255], shadow: [6, 12, 28], switch: "lamp",
  },
  hud: {
    paper: "#1f4f8f", lines: "graph", line: "rgba(220, 235, 255, 0.16)", margin: "rgba(235, 244, 255, 0.5)", ink: "#e6eefc", fine: "#a8bcda",
    tape: "#2b4068", pens: ["#f2f6ff", "#ffc53d"], desk: [226, 236, 248], deskShadow: "rgba(0, 0, 0, 0.8)",
  },
  sound: { pitch: 0.62, q: 0.5, gain: 1.15 },
};

// The back of a printed worksheet, the front showing through, on the kitchen
// table's oilcloth in afternoon light. Gel pens: purple and green.
const WORKSHEET: Theme = {
  id: "worksheet",
  name: "Back of a worksheet",
  blurb: "gel pens on the kitchen table",
  cover: { school: "WORKSHEETS · TERM 2", klass: "kitchen table", book: "#d6b574", label: "#fdfcf8", labelInk: "#6a4a8a", title: ["#5b2aa8", "#0e7d5a"] },
  paper: {
    colour: "#fbfaf6", lines: "none", line: "rgba(0, 0, 0, 0)", bold: "rgba(0, 0, 0, 0)", step: 1, every: 0, top: 100,
    margin: "rgba(84, 84, 92, 0.5)", marginStyle: "pencil",
    print: "rgba(0, 0, 0, 0)", labels: [], noAt: [110, 70], dateAt: [770, 70],
    grain: 0.35, foxing: "rgba(150, 140, 110, 0.025)", extra: "showthrough", age: [238, 228, 202], ageK: 0.35,
  },
  ink: {
    pens: ["#5b2aa8", "#0e7d5a"], names: ["Purple", "Green"], body: ["#5b2aa8", "#0e7d5a"], tool: "gel",
    width: 1.3, wet: 1.4, gloss: 1.8, skip: 0.15, grain: 0, blend: "multiply", lead: [70, 68, 74],
  },
  desk: { kind: "gingham", a: [196, 74, 66], b: [244, 238, 226], accent: [160, 150, 136] },
  light: {
    lamp: [[0, [255, 252, 244]], [0.4, [252, 246, 232]], [0.7, [236, 226, 206]], [0.9, [202, 190, 170]], [1, [164, 152, 134]]],
    day: [[0, [255, 254, 250]], [0.4, [254, 250, 242]], [0.7, [244, 236, 222]], [0.9, [220, 210, 194]], [1, [190, 180, 164]]],
    off: [44, 38, 34], reach: 1.6, fog: [150, 128, 112], shade: [50, 42, 36], warm: [255, 230, 190, 0.05],
    sheen: [255, 255, 255], shadow: [70, 52, 48], switch: "day",
  },
  hud: {
    paper: "#fbfaf6", lines: "none", line: "rgba(0, 0, 0, 0)", margin: "rgba(84, 84, 92, 0.4)", ink: "#3e3c40", fine: "#77757a",
    tape: "#e6d6ad", pens: ["#5b2aa8", "#0e7d5a"], desk: [60, 36, 32], deskShadow: "rgba(255, 246, 236, 0.8)",
  },
  sound: { pitch: 0.85, q: 1.3, gain: 0.6 },
};

export const THEMES: readonly Theme[] = [LAMPLIGHT, NOTEBOOK, COPY, LEGAL, GRAPH, BLUEPRINT, WORKSHEET];
export const DEFAULT_THEME = LAMPLIGHT.id;

const byId = new Map(THEMES.map((t) => [t.id, t]));
export const isTheme = (id: unknown): id is string => typeof id === "string" && byId.has(id);
/** The theme for an id; anything unknown (an old page, a newer room) falls back to Lamplight. */
export const themeOf = (id?: string | null): Theme => (id && byId.get(id)) || LAMPLIGHT;

/** The tokens in force. Renderers read this; it is swapped, never mutated. */
export let theme: Theme = LAMPLIGHT;

/** Deterministic: the same seed always means the same paper (rooms, and the random pick). */
export function themeFromSeed(seed: number): string {
  // a 32-bit integer hash (lowbias32), so neighbouring seeds land on unrelated papers
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return THEMES[(x >>> 0) % THEMES.length].id;
}

/** The surprise on load: a paper from this seed, never the one you had last time. */
export function surprise(seed: number, last?: string | null): string {
  for (let k = 0; k < 64; k++) {
    const id = themeFromSeed(seed + k);
    if (id !== last) return id;
  }
  return themeFromSeed(seed);
}

/** Which paper wins: the room's, then your pick, then the surprise. Pure. */
export function resolveTheme(o: { room?: string | null; chosen?: string | null; surprise: string }): string {
  if (isTheme(o.room)) return o.room;
  if (isTheme(o.chosen)) return o.chosen;
  return isTheme(o.surprise) ? o.surprise : DEFAULT_THEME;
}

// --- the session: storage, the room, the DOM ---------------------------------

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "pft:theme";
const LAST = "pft:lastTheme";
const store = (): Store | null => (typeof localStorage !== "undefined" ? localStorage : null);

let room: string | null = null;
let loadPick: string | null = null;

/** Your pick from settings, or null for a surprise each load. */
export function chosenTheme(s: Store | null = store()): string | null {
  const v = s?.getItem(KEY) ?? null;
  return isTheme(v) ? v : null;
}

/** This load's surprise (drawn once per load, and remembered so the next load differs). */
export function loadTheme(s: Store | null = store(), seed = (Math.random() * 2 ** 32) >>> 0): string {
  if (!loadPick) {
    loadPick = surprise(seed, s?.getItem(LAST));
    s?.setItem(LAST, loadPick);
  }
  return loadPick;
}

/** The paper for anything not already on a page: the title, a new page. */
export function homeTheme(s: Store | null = store()): string {
  return resolveTheme({ room, chosen: chosenTheme(s), surprise: loadTheme(s) });
}

/** The room's paper, while in one. */
export const roomTheme = () => room;

/** Pick a theme in settings (null: surprise me). Persists; outside a room it applies at once. */
export function chooseTheme(id: string | null, s: Store | null = store()) {
  if (id && isTheme(id)) s?.setItem(KEY, id);
  else s?.removeItem(KEY);
  if (!room) applyTheme(homeTheme(s));
}

/** Entering a room (its theme id) or leaving one (nothing): the room's paper wins while you're in it. */
export function setRoomTheme(id?: string | null) {
  room = id && isTheme(id) ? id : null;
  applyTheme(homeTheme());
}

export function currentTheme(): string {
  return theme.id;
}

const listeners = new Set<(t: Theme) => void>();
/** Called after every switch (the renderer drops what it cached for the old paper). */
export function onTheme(fn: (t: Theme) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Draw something in another theme's tokens without switching the room (drawer thumbnails, swatches). */
export function withTheme<T>(id: string | undefined, fn: () => T): T {
  const was = theme;
  theme = themeOf(id);
  try { return fn(); } finally { theme = was; }
}

/** Put a theme in force: tokens for the renderer, CSS for the HUD, words on the cover. */
export function applyTheme(id: string): void {
  const t = themeOf(id);
  const changed = t !== theme;
  theme = t;
  if (typeof document !== "undefined") paintChrome(t);
  if (changed) for (const fn of listeners) fn(t);
}

/** CSS background layers for a scrap of this theme's paper, at `cell` px. */
export function paperLines(lines: Theme["hud"]["lines"], line: string, cell: number): string {
  if (lines === "squared") return `repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px ${cell}px), repeating-linear-gradient(${line} 0 1px, transparent 1px ${cell}px)`;
  if (lines === "graph") {
    // bold squares, with faint fine squares inside them
    const fine = `color-mix(in srgb, ${line} 45%, transparent)`;
    return [`${cell * 2}px`, `${cell / 2}px`].flatMap((size, i) => {
      const c = i ? fine : line;
      return [`repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px ${size})`, `repeating-linear-gradient(${c} 0 1px, transparent 1px ${size})`];
    }).join(", ");
  }
  if (lines === "ruled") return `repeating-linear-gradient(transparent 0 ${cell + 4}px, ${line} ${cell + 4}px ${cell + 5}px)`;
  return "linear-gradient(transparent, transparent)";
}

const rgb = (c: RGB) => `${c[0]}, ${c[1]}, ${c[2]}`;

/** Relative luminance of a #rrggbb colour (WCAG), 0..1. */
export function luma(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function paintChrome(t: Theme) {
  const r = document.documentElement.style;
  const set = (k: string, v: string) => r.setProperty(k, v);
  set("--paper", t.hud.paper);
  set("--grid", t.hud.line);
  set("--lines", paperLines(t.hud.lines, t.hud.line, 17));
  set("--card-glow", luma(t.hud.paper) < 0.35 ? "rgba(255, 255, 255, 0.07)" : "rgba(255, 250, 240, 0.6)");
  // the round tabs lie on the desk: on a light desk they're pale discs with dark words
  const lightDesk = t.hud.desk[0] + t.hud.desk[1] + t.hud.desk[2] < 300;
  set("--tab-bg", lightDesk
    ? "radial-gradient(circle at 40% 35%, rgba(255, 253, 248, 0.85), rgba(236, 230, 218, 0.7))"
    : "radial-gradient(circle at 40% 35%, rgba(255, 240, 215, 0.12), rgba(0, 0, 0, 0.25))");
  set("--card-margin", t.hud.margin);
  set("--pencil", t.hud.ink);
  set("--fine", t.hud.fine);
  set("--tape", t.hud.tape);
  set("--blue", t.hud.pens[0]);
  set("--red", t.hud.pens[1]);
  set("--desk-rgb", rgb(t.hud.desk));
  set("--desk-shadow", t.hud.deskShadow);
  set("--kraft", t.cover.book);
  set("--label", t.cover.label);
  set("--label-ink", t.cover.labelInk);
  set("--title-0", t.cover.title[0]);
  set("--title-1", t.cover.title[1]);
  set("--live-blend", t.ink.blend === "screen" ? "normal" : "multiply");
  document.documentElement.dataset.theme = t.id;
  const school = document.querySelector<HTMLElement>("#cover .label .school");
  if (school) school.textContent = t.cover.school;
  const klass = document.querySelector<HTMLElement>("#cover [data-klass]");
  if (klass) klass.textContent = t.cover.klass;
}

/** The HUD's ink for a player: pen colours as they read on the HUD's paper. */
export const hudPen = (p: 0 | 1) => theme.hud.pens[p];
