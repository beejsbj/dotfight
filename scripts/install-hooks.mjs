#!/usr/bin/env node
// Point git at the tracked hooks in .githooks. Runs from `prepare` (npm install).
// Quiet no-op in CI, outside a git checkout, or when another hooksPath is already set.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOOKS = '.githooks'

export function install({
  env = process.env,
  git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }),
  exists = path => existsSync(resolve(root, path)),
} = {}) {
  if (env.CI || env.VERCEL) return 'skipped: CI'
  if (!exists(HOOKS)) return 'skipped: no .githooks'
  let current = ''
  try { current = git('config', '--get', 'core.hooksPath').trim() } catch { /* unset exits 1 */ }
  try { git('rev-parse', '--git-dir') } catch { return 'skipped: not a git checkout' }
  if (current === HOOKS) return 'already installed'
  if (current) return `skipped: core.hooksPath is already ${current}`
  git('config', 'core.hooksPath', HOOKS)
  return 'installed'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(`git hooks: ${install()}`) } catch (error) { console.warn(`git hooks: could not install (${error.message})`) }
}
