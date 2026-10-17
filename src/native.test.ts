import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME } from "./name";
import { appOs, appPath, backStep, barStyle, fixLinks, isNative, linkOrigin, roomBase, type BackUi } from "./native";
import { RoomLink, type Saved } from "./room";
import type { RoomApi } from "./room-protocol";

// The native shell's bridge, as the app injects it before the page's scripts run.
const asApp = (platform: "ios" | "android") => vi.stubGlobal("Capacitor", { isNativePlatform: () => true, getPlatform: () => platform });

afterEach(() => { vi.unstubAllGlobals(); });

describe("isNative", () => {
  it("is false on the web, where nothing defines the bridge", () => {
    expect(isNative()).toBe(false);
    expect(appOs()).toBe(null);
  });
  it("is true inside the app, and knows which", () => {
    asApp("android");
    expect(isNative()).toBe(true);
    expect(appOs()).toBe("android");
    asApp("ios");
    expect(appOs()).toBe("ios");
  });
  it("is false for a bridge that says web, or one that throws", () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => false, getPlatform: () => "web" });
    expect(isNative()).toBe(false);
    expect(appOs()).toBe(null);
    vi.stubGlobal("Capacitor", { isNativePlatform: () => { throw new Error("no"); } });
    expect(isNative()).toBe(false);
  });
});

describe("rooms from the app", () => {
  it("asks this site's own API on the web, the public site's from the app", () => {
    expect(roomBase(false)).toBe("/api/room");
    expect(roomBase(true)).toBe("https://dotfight.vercel.app/api/room");
    expect(roomBase(true)).toBe(`${GAME.url}/api/room`);
  });
  it("builds links on this site on the web (previews share their own), always the public site's from the app", () => {
    expect(linkOrigin(false, "https://dotfight-git-x.vercel.app")).toBe("https://dotfight-git-x.vercel.app");
    expect(linkOrigin(true, "capacitor://localhost")).toBe(GAME.url);
    expect(linkOrigin(true, "https://localhost")).toBe(GAME.url);
  });

  const saved: Saved = { v: 1, code: "abc234", seat: 0, secret: "s", engine: "core-2", setup: {} as Saved["setup"], names: ["B", null], log: [], applied: 0, pending: [], updated: 0 };
  const env = { api: {} as RoomApi, storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  it("a room link sent from the app opens on the public site", () => {
    vi.stubGlobal("location", { origin: "https://localhost" });
    expect(new RoomLink(saved, env).url).toBe("https://localhost/r/abc234"); // a web page on that origin
    asApp("android");
    expect(new RoomLink(saved, env).url).toBe("https://dotfight.vercel.app/r/abc234");
    vi.stubGlobal("location", { origin: "capacitor://localhost" });
    asApp("ios");
    expect(new RoomLink(saved, env).url).toBe("https://dotfight.vercel.app/r/abc234");
  });
});

describe("the rulebook in the app", () => {
  it("finds the file behind each clean URL", () => {
    expect(appPath("/rules")).toBe("/rules.html");
    expect(appPath("/rules/")).toBe("/rules.html");
    expect(appPath("/rules/advanced")).toBe("/rules/advanced.html");
    expect(appPath("/")).toBe(null);
    expect(appPath("/rules.html")).toBe(null);
    expect(appPath("/r/abc234")).toBe(null);
  });

  it("rewrites a tapped rulebook link on this origin, and leaves the rest", () => {
    let onClick: ((e: { target: unknown }) => void) | undefined;
    const doc = { addEventListener: (_: string, f: typeof onClick) => { onClick = f; } } as unknown as Document;
    vi.stubGlobal("location", { protocol: "capacitor:", host: "localhost" });
    fixLinks(doc);
    const link = (pathname: string, host = "localhost") => {
      const a = { protocol: "capacitor:", host, pathname };
      return { a, target: { closest: () => a } };
    };
    const rules = link("/rules");
    onClick!(rules);
    expect(rules.a.pathname).toBe("/rules.html");
    const advanced = link("/rules/advanced");
    onClick!(advanced);
    expect(advanced.a.pathname).toBe("/rules/advanced.html");
    const play = link("/");
    onClick!(play);
    expect(play.a.pathname).toBe("/");
    const away = link("/rules", "dotfight.vercel.app");
    onClick!(away);
    expect(away.a.pathname).toBe("/rules");
    onClick!({ target: { closest: () => null } }); // not a link
  });
});

describe("Android's back button", () => {
  const ui = (o: Partial<BackUi>): BackUi => ({ sheet: "none", screen: "title", aiming: false, tearing: false, coverBack: false, ...o });

  it("closes the innermost thing first", () => {
    expect(backStep(ui({ sheet: "back", screen: "game", aiming: true }))).toBe("sheet-back");
    expect(backStep(ui({ sheet: "plain", screen: "game" }))).toBe("sheet-close");
    expect(backStep(ui({ sheet: "back", screen: "title" }))).toBe("sheet-back"); // settings, the drawer, how to play
    expect(backStep(ui({ screen: "game", aiming: true }))).toBe("cancel-aim");
  });
  it("returns from a page to the cover", () => {
    expect(backStep(ui({ screen: "game" }))).toBe("to-cover");
    expect(backStep(ui({ screen: "view" }))).toBe("to-cover");
    expect(backStep(ui({ screen: "replay", aiming: true }))).toBe("to-cover");
    // passing the phone: the page is saved; back leaves it rather than skipping the pause
    expect(backStep(ui({ sheet: "gate", screen: "game" }))).toBe("to-cover");
  });
  it("answers the cover's questions and sub-menus before leaving the app", () => {
    expect(backStep(ui({ tearing: true }))).toBe("keep");
    expect(backStep(ui({ coverBack: true }))).toBe("cover-back");
    expect(backStep(ui({}))).toBe("leave");
  });
});

describe("the status bar", () => {
  it("has light icons on the lamplit desk and dark ones on a daylight desk", () => {
    expect(barStyle("rgb(16, 13, 12)")).toBe("DARK");
    expect(barStyle("rgb(206, 204, 202)")).toBe("LIGHT");
    expect(barStyle("rgba(196, 200, 206, 1)")).toBe("LIGHT");
  });
  it("flips once well past the middle of the dawn, never back and forth", () => {
    expect(barStyle("rgb(140, 140, 140)", "DARK")).toBe("DARK");
    expect(barStyle("rgb(140, 140, 140)", "LIGHT")).toBe("LIGHT");
    expect(barStyle("rgb(100, 100, 100)", "LIGHT")).toBe("DARK");
    expect(barStyle("", "LIGHT")).toBe("LIGHT");
  });
});

describe("the web never loads Capacitor", () => {
  const sources = import.meta.glob<string>(["./**/*.ts", "!./**/*.test.ts"], { query: "?raw", import: "default", eager: true });
  it("imports the plugins statically only in native-app.ts", () => {
    expect(Object.keys(sources)).toContain("./main.ts");
    for (const [f, src] of Object.entries(sources)) {
      if (f === "./native-app.ts") continue;
      expect(src, f).not.toMatch(/^\s*import[^(]*from\s+["']@capacitor\//m);
    }
  });
  it("reaches native-app.ts only from behind isNative()", () => {
    const main = sources["./main.ts"];
    expect(main).toMatch(/if \(isNative\(\)\) \{[^}]*import\("\.\/native-app"\)/);
    expect(main).not.toMatch(/^import [^t].*["']\.\/native-app["']/m); // only `import type`
  });
});

// --- native-app.ts, with the plugins mocked ------------------------------------

const plugin = vi.hoisted(() => ({
  listeners: {} as Record<string, () => void>,
  minimizeApp: vi.fn(async () => {}),
  setStyle: vi.fn(async (_: { style: string }) => {}),
  share: vi.fn(async (_: object) => ({})),
  hide: vi.fn(async (_?: object) => {}),
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: async (ev: string, f: () => void) => { plugin.listeners[ev] = f; return { remove: async () => {} }; }, minimizeApp: plugin.minimizeApp } }));
vi.mock("@capacitor/status-bar", () => ({ StatusBar: { setStyle: plugin.setStyle }, Style: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" } }));
vi.mock("@capacitor/share", () => ({ Share: { share: plugin.share } }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: plugin.hide } }));

describe("native-app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("document", { addEventListener: () => {}, fonts: { ready: Promise.resolve() } });
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => f());
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("hands the back button to the game, and goes to the background only from the cover's front", async () => {
    const { start } = await import("./native-app");
    let closable = true;
    start({ back: () => closable, resume: () => {} });
    await flush();
    plugin.listeners.backButton();
    expect(plugin.minimizeApp).not.toHaveBeenCalled();
    closable = false;
    plugin.listeners.backButton();
    expect(plugin.minimizeApp).toHaveBeenCalledTimes(1);
  });

  it("catches rooms up when the app comes back", async () => {
    const { start } = await import("./native-app");
    const resume = vi.fn();
    start({ back: () => true, resume });
    await flush();
    plugin.listeners.resume();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("lifts the splash once the desk has drawn", async () => {
    const { start } = await import("./native-app");
    start({ back: () => true, resume: () => {} });
    await flush();
    expect(plugin.hide).toHaveBeenCalledTimes(1);
  });

  it("sets the status bar for the desk, and only again when the desk crosses over", async () => {
    const { start } = await import("./native-app");
    const app = start({ back: () => true, resume: () => {} });
    expect(plugin.setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
    plugin.setStyle.mockClear();
    app.desk("rgb(16, 13, 12)");
    app.desk("rgb(120, 110, 100)");
    expect(plugin.setStyle).not.toHaveBeenCalled();
    app.desk("rgb(220, 218, 216)");
    app.desk("rgb(200, 198, 196)");
    expect(plugin.setStyle).toHaveBeenCalledTimes(1);
    expect(plugin.setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" });
  });

  it("shares through the system sheet, and says when it was dismissed", async () => {
    const { start } = await import("./native-app");
    const app = start({ back: () => true, resume: () => {} });
    const o = { title: "Dotfight", text: "B challenges you", url: "https://dotfight.vercel.app/r/abc234" };
    expect(await app.share(o)).toBe(true);
    expect(plugin.share).toHaveBeenCalledWith(expect.objectContaining(o));
    plugin.share.mockRejectedValueOnce(new Error("Share canceled"));
    expect(await app.share(o)).toBe(false);
  });
});
