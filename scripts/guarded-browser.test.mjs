import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findRunner, needsGuard, readCgroup } from './lib/guarded-browser.mjs'

const withRunner = fn => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'))
  const file = join(dir, 't3-test-run')
  writeFileSync(file, '#!/bin/sh\n')
  chmodSync(file, 0o755)
  try { return fn(dir, file) } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('a machine with no /proc (macOS, Windows) reads an empty cgroup instead of throwing', () => {
  assert.equal(readCgroup(join(tmpdir(), 'no-such-dir', 'cgroup')), '')
})

test('no guard on PATH or in the home bin means no guard is needed', () => {
  assert.equal(findRunner('/nonexistent-a:/nonexistent-b', '/nonexistent-home'), null)
  assert.equal(needsGuard(null, ''), false)
})

test('the guard is found on PATH', () => {
  withRunner((dir, file) => assert.equal(findRunner(dir, '/nonexistent-home'), file))
})

test('the guard is found in the home bin when PATH is trimmed', () => {
  withRunner((dir, file) => {
    // withRunner put the runner in `dir`; make that the home's .local/bin
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    mkdirSync(join(home, '.local'))
    symlinkSync(dir, join(home, '.local', 'bin'))
    try { assert.equal(findRunner('/usr/bin', home), join(home, '.local', 'bin', 't3-test-run')) } finally { rmSync(home, { recursive: true, force: true }) }
    assert.ok(file)
  })
})

test('a job already inside the guard slice does not re-enter it', () => {
  assert.equal(needsGuard('/x/t3-test-run', '0::/app-t3tests.slice/job.scope'), false)
  assert.equal(needsGuard('/x/t3-test-run', '0::/user.slice/session.scope'), true)
})
