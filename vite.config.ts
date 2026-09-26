import { resolve } from "node:path";
import { defineConfig } from "vite";
import { GAME, nameHtml } from "./src/name.ts";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [
    {
      // one place for the game's name: HTML pages write %GAME_NAME%
      name: "game-name",
      transformIndexHtml: {
        order: "pre",
        handler: (html) =>
          html.replaceAll("%GAME_NAME_HTML%", nameHtml()).replaceAll("%GAME_SHORT%", GAME.short).replaceAll("%GAME_NAME%", GAME.name),
      },
    },
  ],
  build: {
    rollupOptions: {
      input: { main: resolve(root, "index.html"), rules: resolve(root, "rules.html") },
    },
  },
});
