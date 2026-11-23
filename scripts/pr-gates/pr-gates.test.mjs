import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeTestDiff, checkVerification, statedTestReason } from './lib.mjs'
import { run as runTestIntegrity } from './test-integrity.mjs'
import { run as runVerification } from './verification-section.mjs'

const quiet = fn => {
  const log = console.log
  const error = console.error
  console.log = console.error = () => {}
  try { return fn() } finally { console.log = log; console.error = error }
}

/** A --unified=0 diff of one modified file. */
const modified = (path, removed, added) => [
  `diff --git a/${path} b/${path}`, 'index 1111111..2222222 100644', `--- a/${path}`, `+++ b/${path}`,
  '@@ -10,3 +10,3 @@', ...removed.map(l => `-${l}`), ...added.map(l => `+${l}`), '',
].join('\n')
const kinds = diff => analyzeTestDiff(diff).map(f => f.kind)
const T = 'src/__tests__/stage.test.ts'

// ---------------------------------------------------------------------------
// Verification section
// ---------------------------------------------------------------------------

test('a body with no Verification section fails', () => {
  assert.equal(checkVerification('## What changed\n\nStuff.').ok, false)
  assert.equal(checkVerification('').ok, false)
  assert.equal(checkVerification(undefined).ok, false)
})

test('an empty, placeholder, comment-only or too-short section fails', () => {
  for (const body of [
    '## Verification\n\n## Not checked\nnothing',
    '## Verification\n\nTODO\n',
    '## Verification\n\nn/a',
    '## Verification\n\n<!-- Required. What you ran and what it showed -->\n\n## Not checked',
    '## Verification\n\nran it, ok',
  ]) assert.equal(checkVerification(body).ok, false, body)
})

test('a section with commands and results passes, at any heading level', () => {
  const evidence = '`npm run lint` exits 0; `npm run typecheck` exits 0; the new test fails on the old code.'
  assert.equal(checkVerification(`## What\n\nx\n\n## Verification\n\n${evidence}\n\n## Not checked\n\nnothing`).ok, true)
  assert.equal(checkVerification(`### Verification\n${evidence}`).ok, true)
  assert.equal(checkVerification(`## Verification\n\nNot run: documentation only, no behaviour changed.`).ok, true)
})

test('a "Verification" heading inside a code fence does not count', () => {
  assert.equal(checkVerification('```\n## Verification\nnpm run lint exits 0 and typecheck exits 0\n```').ok, false)
})

test('"Not run: <why>" passes with a short honest reason, but not with an empty one', () => {
  assert.equal(checkVerification('## Verification\nNot run: docs only').ok, true)
  assert.equal(checkVerification('## Verification\nNot run:').ok, false)
  assert.equal(checkVerification('## Verification\nNot run: x').ok, false)
})

test('the verification-section script exits 1 without the section and 0 with it', () => {
  assert.equal(quiet(() => runVerification('## What\n\nx')), 1)
  assert.equal(quiet(() => runVerification('## Verification\n\n`npm test` passed: 1562 tests, 0 failed.')), 0)
})

// ---------------------------------------------------------------------------
// Stated reason
// ---------------------------------------------------------------------------

test('a stated reason needs the label and real words', () => {
  assert.ok(statedTestReason('Test change: the feature was removed in BJS-495, so its tests go too.'))
  assert.ok(statedTestReason('- Test changes — widened because the DSP now rounds to the block size'))
  assert.equal(statedTestReason('Test change: n/a'), null)
  assert.equal(statedTestReason('Test change: <why this is right>'), null)
  assert.equal(statedTestReason('Test change: because'), null)
  assert.equal(statedTestReason('We changed a test because the feature was removed.'), null)
  // a placeholder line before the real one does not hide it; a quoted example in a fence does not count
  assert.ok(statedTestReason('Test change: <why>\n\nTest change: the bound moved with the new easing curve.'))
  assert.equal(statedTestReason('```\nTest change: an example reason that is long enough\n```'), null)
  assert.equal(statedTestReason('<!-- Test change: put the reason here, like this -->'), null)
})

// ---------------------------------------------------------------------------
// Test diff analysis
// ---------------------------------------------------------------------------

test('deleting a test file is flagged', () => {
  const diff = ['diff --git a/src/__tests__/old.test.ts b/src/__tests__/old.test.ts', 'deleted file mode 100644',
    'index 1111111..0000000', '--- a/src/__tests__/old.test.ts', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-it("x", () => {})', '-expect(1).toBe(1)', ''].join('\n')
  assert.deepEqual(kinds(diff), ['deleted-file'])
})

test('adding a skip, todo or focus is flagged, a comment about one is not', () => {
  for (const line of ['  it.skip("plays", () => {', 'describe.skip("stage", () => {', '  xit("plays", () => {', '  test.todo("later")',
    '  it.skipIf(isCI)("plays", () => {', '  it.only("plays", () => {']) {
    assert.ok(kinds(modified(T, ['  it("plays", () => {'], [line])).includes('skipped'), line)
  }
  assert.deepEqual(kinds(modified(T, ['  // old'], ['  // we used to it.skip() this'])), [])
  // found by the gate's own first CI run: a test that quotes a skip marker is not skipping anything
  assert.deepEqual(kinds(modified(T, ['  const a = 1'], ['  const line = \'  it.skip("plays", () => {\''])), [])
})

test('removing a test case or assertions is flagged; renaming one is not', () => {
  assert.ok(kinds(modified(T, ['  it("a", () => {', '    expect(a).toBe(1)', '  })'], [])).includes('removed-tests'))
  assert.ok(kinds(modified(T, ['    expect(a).toBe(1)', '    expect(b).toBe(2)'], ['    expect(a).toBe(1)'])).includes('removed-assertions'))
  assert.deepEqual(kinds(modified(T, ['  it("plays a note", () => {'], ['  it("plays a held note", () => {'])), [])
})

test('commenting a test or assertion out is flagged', () => {
  assert.ok(kinds(modified(T, ["  it('x', () => {", '    expect(a).toBe(1)', '  })'], ["  // it('x', () => {", '  //   expect(a).toBe(1)', '  // })'])).includes('removed-tests'))
  assert.ok(kinds(modified(T, ['    expect(a).toBe(1)'], ['    // expect(a).toBe(1)'])).includes('removed-assertions'))
  assert.deepEqual(kinds(modified(T, ['  // old note'], ['  // new note'])), [])
})

test('deleting one test and adding a different one in the same file is flagged', () => {
  const found = analyzeTestDiff(modified(T, ["  it('keeps order', () => {", '    expect(a).toBe(1)', '  })'], ["  it('rejects an empty list', () => {", '    expect(b).toBe(2)', '  })']))
  assert.ok(found.some(f => f.kind === 'removed-tests' && /keeps order/.test(f.detail)), JSON.stringify(found))
})

test('more skip forms are flagged', () => {
  for (const line of ["  it.concurrent.skip('x', f)", "  it('x', { skip: true }, f)", '  this.skip()', "  describe.sequential.skip('x', f)"]) {
    assert.ok(kinds(modified(T, ['  const a = 1'], [line])).includes('skipped'), line)
  }
})

test('a raised minimum is not a widened tolerance', () => {
  assert.deepEqual(kinds(modified(T, ['const threshold = 0.5'], ['const threshold = 0.8'])), [])
  assert.deepEqual(kinds(modified(T, ['const tolerance = 0.5'], ['const tolerance = 0.8'])), ['widened'])
})

test('content lines that start with -- or ++ are read as content', () => {
  const diff = ['diff --git a/src/__tests__/a.test.ts b/src/__tests__/a.test.ts', '--- a/src/__tests__/a.test.ts', '+++ b/src/__tests__/a.test.ts', '@@ -1 +1 @@', '---- it("x", f)', '++++ it.skip("x", f)'].join('\n')
  assert.equal(analyzeTestDiff(diff).length, 0) // not a real skip line (starts with ++++), and must not crash
})

test('real past loosening is flagged: a bound widened in e4fbc579 (BJS-506)', () => {
  const found = analyzeTestDiff(modified(T, ['    expect(playedString?.opacity).toBeLessThan(0.3);'], ['    expect(playedString?.opacity).toBeLessThan(0.6);']))
  assert.deepEqual(found.map(f => f.kind), ['weakened'])
  assert.match(found[0].detail, /upper bound widened/)
})

test('real past loosening is flagged: a lower bound relaxed in a495460c', () => {
  const found = analyzeTestDiff(modified(T, ['    expect(interiorWidth).toBeGreaterThanOrEqual(10.2);'], ['    expect(interiorWidth).toBeGreaterThanOrEqual(0.8);']))
  assert.match(found[0].detail, /lower bound widened/)
})

test('real past tightening and re-baselining are not flagged', () => {
  // 1ee31f2f: 136 -> 72 voices; 5d925b0b: <= became <; 6337f06f: new expected value, same precision
  assert.deepEqual(kinds(modified(T, ['    expect(core.voiceCount).toBeLessThanOrEqual(136)'], ['    expect(core.voiceCount).toBeLessThanOrEqual(72)'])), [])
  assert.deepEqual(kinds(modified(T, ['    expect(radii[1]).toBeLessThanOrEqual(radii[2]!);'], ['    expect(radii[1]).toBeLessThan(radii[2]!);'])), [])
  assert.deepEqual(kinds(modified(T, ['    expect(events[0].duration).toBeCloseTo(520, 0);'], ['    expect(events[0].duration).toBeCloseTo(500, 0);'])), [])
})

test('a relaxed comparison on an unchanged operand is flagged (< became <=)', () => {
  assert.deepEqual(kinds(modified(T, ['    expect(a).toBeLessThan(b)'], ['    expect(a).toBeLessThanOrEqual(b)'])), ['weakened'])
})

test('lowering toBeCloseTo precision is flagged, raising it is not', () => {
  assert.deepEqual(kinds(modified(T, ['    expect(x).toBeCloseTo(1.5, 6)'], ['    expect(x).toBeCloseTo(1.5, 2)'])), ['weakened'])
  assert.deepEqual(kinds(modified(T, ['    expect(x).toBeCloseTo(1.5)'], ['    expect(x).toBeCloseTo(1.5, 6)'])), [])
  assert.deepEqual(kinds(modified(T, ['    expect(x).toBeCloseTo(1.5, 6)'], ['    expect(x).toBeCloseTo(1.5)'])), ['weakened'])
})

test('a stricter matcher becoming a weaker one is flagged', () => {
  for (const [before, after] of [
    ['expect(a).toBe(true)', 'expect(a).toBeTruthy()'],
    ['expect(list).toEqual([1, 2])', 'expect(list).toContain(1)'],
    ['expect(list).toHaveLength(3)', 'expect(list).toBeDefined()'],
    ['expect(a).toBe(1)', 'expect(a).not.toBe(2)'],
    ['expect(call).toHaveBeenCalledWith(1)', 'expect(call).toHaveBeenCalledWith(expect.any(Number))'],
  ]) assert.deepEqual(kinds(modified(T, [`    ${before}`], [`    ${after}`])), ['weakened'], `${before} -> ${after}`)
  assert.deepEqual(kinds(modified(T, ['    expect(a).toBeTruthy()'], ['    expect(a).toBe(true)'])), [])
})

test('changing what is asserted is not weakening it (4ffe5804, 1bbc896a): extra arguments, a different negated claim', () => {
  assert.deepEqual(kinds(modified(T, ['    expect(mocks.prepare).toHaveBeenLastCalledWith(context, resolved)'],
    ['    expect(mocks.prepare).toHaveBeenLastCalledWith(context, resolved, expect.any(AbortSignal))'])), [])
  assert.deepEqual(kinds(modified(T, ['    expect(mocks.stop).toHaveBeenCalledTimes(1)'], ['    expect(mocks.stop).not.toHaveBeenCalled()'])), [])
})

test('assertions split over lines are paired by their continuation matcher', () => {
  assert.deepEqual(kinds(modified(T, ['      .toBeLessThan(0.3);'], ['      .toBeLessThan(0.6);'])), ['weakened'])
})

test('a widened tolerance constant is flagged, a tightened one is not', () => {
  assert.deepEqual(kinds(modified(T, ['const EPSILON = 1e-6'], ['const EPSILON = 1e-3'])), ['widened'])
  assert.deepEqual(kinds(modified(T, ['const TOLERANCE = 0.05'], ['const TOLERANCE = 0.01'])), [])
})

test('non-test files are ignored, and spec files and __tests__ directories count', () => {
  assert.deepEqual(kinds(modified('src/stage.ts', ['expect(a).toBe(1)'], ['it.skip("x")'])), [])
  assert.deepEqual(kinds(modified('scripts/x.spec.mjs', ['  it("a", () => {})'], ['  it.skip("a", () => {})'])), ['skipped'])
  assert.deepEqual(kinds(modified('src/__tests__/helpers/h.ts', ['  it("a", () => {})'], ['  it.skip("a", () => {})'])), ['skipped'])
})

// ---------------------------------------------------------------------------
// The script against a real git history
// ---------------------------------------------------------------------------

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' })

function withRepo(files, change, check) {
  const cwd = mkdtempSync(join(tmpdir(), 'pr-gates-'))
  try {
    git(cwd, 'init', '-q', '-b', 'main')
    mkdirSync(join(cwd, 'src/__tests__'), { recursive: true })
    for (const [path, text] of Object.entries(files)) writeFileSync(join(cwd, path), text)
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'base')
    git(cwd, 'checkout', '-qb', 'practice')
    change(cwd)
    git(cwd, 'add', '-A'); git(cwd, 'commit', '-qm', 'change')
    check(cwd)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
}

const BASE = { 'src/__tests__/a.test.ts': 'it("a", () => {\n  expect(f()).toBeLessThan(0.3)\n})\n', 'src/__tests__/b.test.ts': 'it("b", () => {\n  expect(g()).toBe(1)\n})\n' }
const reason = 'Test change: the feature was removed in BJS-495, so its tests go with it.'
const go = (cwd, body) => quiet(() => runTestIntegrity({ base: 'main', head: 'practice', body, cwd }))

test('deleting a test fails without a reason and passes with one', () => {
  withRepo(BASE, cwd => unlinkSync(join(cwd, 'src/__tests__/b.test.ts')), cwd => {
    assert.equal(go(cwd, '## Verification\n\nran it'), 1)
    assert.equal(go(cwd, `${reason}`), 0)
  })
})

test('skipping a test fails without a reason and passes with one', () => {
  withRepo(BASE, cwd => writeFileSync(join(cwd, 'src/__tests__/b.test.ts'), 'it.skip("b", () => {\n  expect(g()).toBe(1)\n})\n'), cwd => {
    assert.equal(go(cwd, ''), 1)
    assert.equal(go(cwd, reason), 0)
  })
})

test('loosening a test fails without a reason and passes with one', () => {
  withRepo(BASE, cwd => writeFileSync(join(cwd, 'src/__tests__/a.test.ts'), 'it("a", () => {\n  expect(f()).toBeLessThan(0.6)\n})\n'), cwd => {
    assert.equal(go(cwd, ''), 1)
    assert.equal(go(cwd, 'Test change: n/a'), 1)
    assert.equal(go(cwd, 'Test change: the new easing peaks at 0.55, which the old bound forbade.'), 0)
  })
})

test('a rename plus weakening, and a non-ASCII test name, are still seen', () => {
  withRepo(BASE, cwd => {
    git(cwd, 'mv', 'src/__tests__/a.test.ts', 'src/__tests__/é.test.ts')
    writeFileSync(join(cwd, 'src/__tests__/é.test.ts'), 'it("a", () => {\n  expect(f()).toBeLessThan(0.9)\n})\n')
  }, cwd => {
    assert.equal(go(cwd, ''), 1)
    assert.equal(go(cwd, reason), 0)
  })
  withRepo({ ...BASE, 'src/__tests__/é.test.ts': 'it("e", () => {\n  expect(1).toBe(1)\n})\n' }, cwd => unlinkSync(join(cwd, 'src/__tests__/é.test.ts')), cwd => {
    assert.equal(go(cwd, ''), 1)
  })
})

test('a change that touches no test, or adds one, passes with no reason', () => {
  withRepo(BASE, cwd => {
    writeFileSync(join(cwd, 'src/x.ts'), 'export const x = 1\n')
    writeFileSync(join(cwd, 'src/__tests__/c.test.ts'), 'it("c", () => {\n  expect(1).toBe(1)\n})\n')
  }, cwd => assert.equal(go(cwd, ''), 0))
})
