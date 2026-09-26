// Keep browser jobs outside the T3 control server's resource budget on bjslab.
import { hostname } from "node:os";
import { readFileSync, accessSync, constants } from "node:fs";
import { spawn } from "node:child_process";

export function needsGuard(host, cgroup) {
  return host.split(".")[0] === "bjslab" && !cgroup.includes("/app-t3tests.slice/");
}

export async function guardBrowserJob() {
  if (hostname().split(".")[0] !== "bjslab") return;
  // Check actual cgroup membership, not an environment flag a child could inherit.
  if (!needsGuard(hostname(), readFileSync("/proc/self/cgroup", "utf8"))) return;
  const runner = "/home/admin/.local/bin/t3-test-run";
  accessSync(runner, constants.X_OK); // Fail closed if the host guard is missing.
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
