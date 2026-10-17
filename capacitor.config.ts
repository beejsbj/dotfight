// The store apps (BJS-461): Capacitor wraps the web build in `dist/` for
// Android and iOS. See docs/apps.md. Loaded by the Capacitor CLI through
// Node's own type stripping (TypeScript 7 has no transpile API): Node 22.18+.
import type { CapacitorConfig } from "@capacitor/cli";
import { GAME } from "./src/name.ts";

// the desk with the lamp off: what shows before the page has drawn
const DESK = "#0b0706";

const config: CapacitorConfig = {
  // Permanent once the first build is uploaded to either store.
  appId: "com.beejsbj.dotfight",
  appName: GAME.name,
  webDir: "dist",
  backgroundColor: DESK,
  ios: {
    // the page lays itself out with env(safe-area-inset-*); no automatic inset
    contentInset: "never",
    // no rubber-band bounce: the page is a canvas, not a document
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // src/native.ts hides it as soon as the desk has drawn; this is only the backstop
      launchAutoHide: true,
      launchShowDuration: 4000,
      launchFadeOutDuration: 250,
      backgroundColor: DESK,
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: false,
      splashImmersive: false,
    },
    SystemBars: {
      // edge to edge, with env(safe-area-inset-*) right on every Android WebView
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      // light icons on the dark desk; src/native.ts follows the desk from then on
      style: "DARK",
    },
    StatusBar: {
      style: "DARK",
      overlaysWebView: true,
    },
  },
};

export default config;
