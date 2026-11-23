import { configDefaults, defineConfig } from "vitest/config";

// scripts/**/*.test.mjs are node:test files (npm run test:scripts), not Vitest suites.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, ".claude/**", "scripts/**"] } });
