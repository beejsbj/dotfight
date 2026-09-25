import { configDefaults, defineConfig } from "vitest/config";

// Round-2 rule sets play heavier bot-vs-bot games in the replay tests.
export default defineConfig({ test: { testTimeout: 30000, exclude: [...configDefaults.exclude, ".claude/**", ".tmp/**"] } });
