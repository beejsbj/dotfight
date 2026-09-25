import { defineConfig } from "vite";

// Scratch output (playtests, lab runs) and docs shouldn't be watched by the dev server.
export default defineConfig({ server: { watch: { ignored: ["**/.tmp/**", "**/docs/**"] } } });
