// Keep browser jobs outside the T3 control server's resource budget on a machine that has the
// `t3-test-run` guard on its PATH. Elsewhere there is no guard and these are no-ops.
import { readFileSync, accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";

// Playwright launches Chrome with --disable-dev-shm-usage, which puts its shared
// memory (every canvas and compositor frame) in $TMPDIR. The guard's $TMPDIR is
// on the write-capped SSD, so each frame became disk writes and the game ran at
// ~2 fps. /dev/shm is RAM, and counts against the job's memory cap instead.
export const browserOpts = { ignoreDefaultArgs: ["--disable-dev-shm-usage"] };

const RUNNER = "t3-test-run";

/** The guard's path if it is on PATH (or in ~/.local/bin, for a trimmed PATH) and executable, else null. */
export function findRunner(pathVar = process.env.PATH ?? "", home = homedir()) {
  for (const dir of [...pathVar.split(delimiter).filter(Boolean), join(home, ".local", "bin")]) {
    const candidate = join(dir, RUNNER);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* keep looking */ }
  }
  return null;
}

export function needsGuard(runner, cgroup) {
  return Boolean(runner) && !cgroup.includes("/app-t3tests.slice/");
}

/** This process's cgroup, or "" where there is none (macOS, Windows): there is no guard to enter there. */
export function readCgroup(path = "/proc/self/cgroup") {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

export async function guardBrowserJob() {
  const runner = findRunner();
  if (!runner) return;
  // Check actual cgroup membership, not an environment flag a child could inherit.
  if (!needsGuard(runner, readCgroup())) return;
  const child = spawn(runner, [process.execPath, ...process.execArgv, ...process.argv.slice(1)], {
    cwd: process.cwd(), env: process.env, stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status, signal) => resolve(status ?? (signal === "SIGINT" ? 130 : 143)));
  });
  process.exit(code);
}
