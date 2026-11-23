#!/usr/bin/env node
// Pre-commit: lint, type-check, and the tests related to the staged files.
// Runs the package scripts' own commands (see package.json), so what CI runs and
// what the hook runs stay the same. Docs-only commits skip all three.
//
// PRE_COMMIT_RUNNER: optional command prefix for the checks, for a machine that
// meters heavy jobs (for example a job guard). Unset, the checks run directly.
// Skip once with `git commit --no-verify`; CI is the backstop.
import { spawnSync, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CODE = /\.[cm]?[jt]sx?$/
const NOT_CODE = /\.(?:md|txt|png|jpe?g|svg|webp|ico|woff2?)$|^docs\/|^LICENSE$/

export function stagedFiles() {
  return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean)
}

/** The checks to run for a set of staged files, in order. Empty when only docs or assets are staged. */
export function plan(files, exists = path => existsSync(resolve(root, path)), runner = process.env.PRE_COMMIT_RUNNER) {
  // Deleted files count: removing a module can break its importers, and lint/typecheck see that.
  if (!files.some(file => !NOT_CODE.test(file))) return []
  const related = files.filter(file => CODE.test(file) && exists(file))
  const prefix = runner ? runner.split(/\s+/).filter(Boolean) : []
  const npm = args => ({ command: prefix[0] ?? 'npm', args: prefix.length ? [...prefix.slice(1), 'npm', ...args] : args })
  return [
    { name: 'lint', ...npm(['run', '--silent', 'lint']) },
    { name: 'type-check', ...npm(['run', '--silent', 'typecheck']) },
    ...(related.length ? [{ name: 'related tests', ...npm(['exec', '--', 'vitest', 'related', '--run', '--passWithNoTests', ...related]) }] : []),
  ]
}

function main() {
  const steps = plan(stagedFiles())
  if (!steps.length) { console.log('pre-commit: only docs/assets staged: skipping checks.'); return 0 }
  if (!existsSync(resolve(root, 'node_modules'))) {
    console.error('pre-commit: node_modules is missing, so the checks cannot run. Run `npm ci` (or skip once with `git commit --no-verify`; CI will still run them).')
    return 1
  }
  for (const step of steps) {
    console.log(`\npre-commit: ${step.name}`)
    const started = Date.now()
    const result = spawnSync(step.command, step.args, { cwd: root, stdio: 'inherit' })
    if (result.status !== 0) {
      console.error(`\npre-commit: ${step.name} failed (exit ${result.status ?? result.signal}). Fix it, or skip once with \`git commit --no-verify\` (CI will still run it).`)
      return result.status ?? 1
    }
    console.log(`pre-commit: ${step.name} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main()
