import test from 'node:test'
import assert from 'node:assert/strict'
import { plan } from './pre-commit.mjs'
import { install } from './install-hooks.mjs'

const always = () => true
const names = steps => steps.map(step => step.name)

test('docs-only commits skip every check', () => {
  assert.deepEqual(plan(['README.md', 'docs/rules-lab/round-3.md', 'LICENSE'], always), [])
})

test('a code change runs lint, type-check and the related tests', () => {
  const steps = plan(['src/game.ts', 'README.md'], always)
  assert.deepEqual(names(steps), ['lint', 'type-check', 'related tests'])
  assert.deepEqual(steps[2].args.slice(-1), ['src/game.ts'])
})

test('a deleted file still runs lint and type-check, but has no test to select', () => {
  assert.deepEqual(names(plan(['src/old.ts'], () => false)), ['lint', 'type-check'])
})

test('PRE_COMMIT_RUNNER prefixes every check', () => {
  const steps = plan(['src/game.ts'], always, 'metered-runner --small')
  for (const step of steps) assert.deepEqual([step.command, ...step.args.slice(0, 2)], ['metered-runner', '--small', 'npm'])
})

test('the installer sets core.hooksPath once and leaves other settings alone', () => {
  const calls = []
  const git = (...args) => { calls.push(args.join(' ')); return '' }
  assert.equal(install({ env: {}, git, exists: always }), 'installed')
  assert.ok(calls.includes('config core.hooksPath .githooks'))
  assert.match(install({ env: {}, git: (...a) => (a[0] === 'config' && a[1] === '--get' ? 'elsewhere' : ''), exists: always }), /already elsewhere/)
  assert.equal(install({ env: { CI: 'true' }, git, exists: always }), 'skipped: CI')
})
