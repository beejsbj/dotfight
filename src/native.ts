// The store apps (BJS-461): is this page running inside the Android or iOS
// app, and the few things that differ there. Everything here but `isNative`
// itself is pure and tested; the plugins live in `native-app.ts`, which only
// the app ever loads, so the web never fetches a byte of Capacitor.
//
// The one check: the app's native shell injects `window.Capacitor` (the
// bridge `@capacitor/core` wraps) before any script on the page runs, and its
// `isNativePlatform()` is what `Capacitor.isNativePlatform()` answers. On the
// web nothing defines it, so every app path below is skipped.

import { GAME } from "./name";

export type AppOs = "ios" | "android";

interface Bridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}
const bridge = (): Bridge | undefined => (globalThis as { Capacitor?: Bridge }).Capacitor;

/** Inside the Android or iOS app? */
export function isNative(): boolean {
  try { return bridge()?.isNativePlatform?.() === true; } catch { return false; }
}

/** Which app this is, or null on the web. */
export function appOs(): AppOs | null {
  if (!isNative()) return null;
  return bridge()?.getPlatform?.() === "ios" ? "ios" : "android";
}

// --- rooms: the app's own origin (capacitor://localhost, https://localhost) is no website

/** Where the room API is: this site's own on the web, the public site's from the app. Pure. */
export function roomBase(native: boolean): string {
  return native ? `${GAME.url}/api/room` : "/api/room";
}

/**
 * The origin a room link is built on: this site's on the web (a preview or a
 * dev server shares its own links, as it always has), the public site's from
 * the app, so a link sent from a phone always opens for the friend. Pure.
 */
export function linkOrigin(native: boolean, here: string): string {
  return native ? GAME.url : here;
}

// --- the rulebook: the app's file server has no clean URLs ---------------------

// Vercel serves /rules from rules.html (cleanUrls). Inside the app the page is
// served from the bundle, where a path without an extension is the game.
const CLEAN: Record<string, string> = { "/rules": "/rules.html", "/rules/advanced": "/rules/advanced.html" };

/** The file a clean path is in, or null if it's fine as it is. Pure. */
export function appPath(pathname: string): string | null {
  return CLEAN[pathname.replace(/\/+$/, "")] ?? null;
}

/** In the app: send every same-page-origin rulebook link to its file. */
export function fixLinks(doc: Document = document) {
  doc.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    // (protocol and host, not origin: a capacitor:// URL's origin may read "null")
    if (!a || a.protocol !== location.protocol || a.host !== location.host) return;
    const to = appPath(a.pathname);
    if (to) a.pathname = to; // the hash and query ride along
  }, true);
}

// --- Android's back button ------------------------------------------------------

export interface BackUi {
  /** the sheet on show: none, one with its own back/done button, the pass-the-phone gate, or one without */
  sheet: "none" | "back" | "gate" | "plain";
  screen: "title" | "game" | "view" | "replay";
  /** a soldier picked up, a pull held, or the camera riding a lunge */
  aiming: boolean;
  /** the cover is asking "tear it out?" */
  tearing: boolean;
  /** the cover's slip is a sub-menu (a new room, an opened link) with its own back button */
  coverBack: boolean;
}

export type BackStep =
  | "sheet-back" // press the sheet's own back/done button
  | "sheet-close" // close it (the result card: "look at it")
  | "cancel-aim" // put the soldier down, as Escape does
  | "keep" // answer "tear it out?" with no
  | "cover-back" // press the slip's back button
  | "to-cover" // leave the page for the cover, as the menu button does
  | "leave"; // on the cover's front: let the app go

/**
 * What the back button does, innermost first: a sheet, an aim, the page, a
 * question on the cover, a sub-menu, and only then out of the app. Pure.
 */
export function backStep(ui: BackUi): BackStep {
  if (ui.sheet === "back") return "sheet-back";
  // passing the phone: the game is saved, so back goes to the cover rather than skipping the pause
  if (ui.sheet === "gate") return "to-cover";
  if (ui.sheet === "plain") return "sheet-close";
  if (ui.screen !== "title") return ui.aiming && ui.screen === "game" ? "cancel-aim" : "to-cover";
  if (ui.tearing) return "keep";
  if (ui.coverBack) return "cover-back";
  return "leave";
}

// --- the status bar follows the desk ------------------------------------------

export type BarStyle = "DARK" | "LIGHT"; // DARK: light icons, for a dark desk

/**
 * The status bar's icons against the desk's colour (`rgb(r, g, b)`): light on
 * the lamplit night, dark on a daylight desk. It changes over the dawn, so it
 * only flips once well past the middle, never back and forth. Pure.
 */
export function barStyle(css: string, was: BarStyle = "DARK"): BarStyle {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css);
  if (!m) return was;
  const y = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
  if (was === "DARK" && y > 0.6) return "LIGHT";
  if (was === "LIGHT" && y < 0.45) return "DARK";
  return was;
}
