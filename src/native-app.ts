// The store apps' native side (BJS-461): the plugins, wired to the game. Only
// ever loaded inside the app (main.ts imports it behind `isNative()`), so the
// web build fetches none of it. The decisions are pure, in `native.ts`.

import { App } from "@capacitor/app";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { barStyle, fixLinks, type BarStyle } from "./native";

export interface Hooks {
  /** Android's back button: close or leave whatever is innermost. False: nothing is left but the cover. */
  back(): boolean;
  /** the app came back to the front */
  resume(): void;
}

export interface NativeApp {
  /** the desk changed colour: the status bar follows it */
  desk(css: string): void;
  /** the system share sheet; false if it was dismissed or failed */
  share(o: { title: string; text: string; url: string }): Promise<boolean>;
}

const quiet = (p: Promise<unknown>) => void p.catch(() => {});

export function start(h: Hooks): NativeApp {
  fixLinks();
  // back from the cover's front sends the app to the background, as Android's own apps do
  quiet(App.addListener("backButton", () => { if (!h.back()) quiet(App.minimizeApp()); }));
  quiet(App.addListener("resume", () => h.resume()));
  let style: BarStyle = "DARK";
  quiet(StatusBar.setStyle({ style: Style.Dark }));
  // the splash lifts once the desk has drawn (the backstop is capacitor.config.ts)
  void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => quiet(SplashScreen.hide({ fadeOutDuration: 250 })))));
  return {
    desk(css) {
      const next = barStyle(css, style);
      if (next === style) return;
      style = next;
      quiet(StatusBar.setStyle({ style: next === "DARK" ? Style.Dark : Style.Light }));
    },
    async share(o) {
      try {
        await Share.share({ ...o, dialogTitle: "Send it to your friend" });
        return true;
      } catch {
        return false; // dismissed
      }
    },
  };
}
