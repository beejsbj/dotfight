// Two PR gates, as pure functions so they can be tested without GitHub.
//
//   checkVerification(body)      a PR body must carry a real "## Verification" section
//   analyzeTestDiff(diff)        a diff must not delete, skip or loosen a test ...
//   statedTestReason(body)       ... unless the PR body says why ("Test change: <reason>")
//
// This guards against accidents, not adversaries: a PR can edit these files, so the
// real backstop is review plus branch protection. Heuristics are line-based on purpose
// (no parser), tuned on a Vitest repo's history; see docs/pr-gates.md for what they miss.

// ---------------------------------------------------------------------------
// Configuration: what counts as a test file, and a stated reason.
// ---------------------------------------------------------------------------

export const TEST_FILE = /(^|\/)(__tests__\/|[^/]*\.(test|spec)\.[cm]?[jt]sx?$)/

const MIN_VERIFICATION_CHARS = 30
const MIN_REASON_CHARS = 20

// ---------------------------------------------------------------------------
// Gate 1: Verification section
// ---------------------------------------------------------------------------

const stripComments = text => text.replace(/<!--[\s\S]*?-->/g, '')

/** Text under a "## Verification" heading, up to the next heading, or null. */
export function verificationSection(body) {
  const lines = stripComments(body ?? '').split(/\r?\n/)
  let fence = false
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue }
    if (fence) continue
    const heading = lines[i].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (!heading) continue
    if (start >= 0 && heading[1].length <= level) return lines.slice(start, i).join('\n')
    if (start < 0 && /^verification\b/i.test(heading[2])) { start = i + 1; level = heading[1].length }
  }
  return start >= 0 ? lines.slice(start).join('\n') : null
}

const PLACEHOLDER = /^(?:[-*_>\s]*|(?:todo|tbd|tba|n\/?a|none|nothing|wip|pending|x+)\.?)$/i

/** @returns {{ ok: boolean, reason?: string }} */
export function checkVerification(body) {
  const section = verificationSection(body)
  if (section === null) {
    return { ok: false, reason: 'The PR description has no "## Verification" section. Add one listing what you ran and what it showed (commands and results), or "Not run: <why>".' }
  }
  const text = section.replace(/\s+/g, ' ').trim()
  if (PLACEHOLDER.test(text)) {
    return { ok: false, reason: 'The "## Verification" section is empty or a placeholder. Say what you ran and what it showed, or "Not run: <why>".' }
  }
  // "Not run: <why>" is an advertised form, so a short honest reason must pass.
  if (/^not run\s*[:—–-]\s*\S.{4,}/i.test(text)) return { ok: true }
  if (text.length < MIN_VERIFICATION_CHARS) {
    return { ok: false, reason: `The "## Verification" section is under ${MIN_VERIFICATION_CHARS} characters. Give the command or action and its result, or "Not run: <why>".` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Gate 2: tests deleted, skipped or loosened
// ---------------------------------------------------------------------------

/** The reason line in a PR body: "Test change: <reason>" (also "Test changes", "Test-change"). */
export function statedTestReason(body) {
  const text = stripComments(body ?? '').replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm, '')
  for (const match of text.matchAll(/^[ \t]*(?:[-*][ \t]+)?test[- ]?changes?[ \t]*[:—–-][ \t]*(.+)$/gim)) {
    const reason = match[1].trim()
    if (reason.length >= MIN_REASON_CHARS && !PLACEHOLDER.test(reason) && !/^<.*>$/.test(reason)) return reason
  }
  return null
}

/** Split a unified diff (ideally `--unified=0`) into per-file records. */
export function parseDiff(diff) {
  const files = []
  let file = null
  let hunk = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const paths = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
      file = { path: paths?.[2] ?? line, oldPath: paths?.[1], deleted: false, added: false, hunks: [] }
      files.push(file)
      hunk = null
    } else if (!file) {
      continue
    } else if (line.startsWith('deleted file mode')) {
      file.deleted = true
    } else if (line.startsWith('new file mode')) {
      file.added = true
    } else if (line.startsWith('@@')) {
      hunk = { removed: [], added: [] }
      file.hunks.push(hunk)
    } else if (hunk && line.startsWith('-')) {
      hunk.removed.push(line.slice(1))
    } else if (hunk && line.startsWith('+')) {
      hunk.added.push(line.slice(1))
    }
  }
  return files
}

// A skip marker only counts at the start of a statement, so a test that mentions
// "it.skip(" inside a string or a comment (this gate's own tests do) is not a skip.
const SKIP = new RegExp('^\\s*(?:' + [
  '(?:it|test|describe|suite|bench)(?:\\s*\\.\\s*\\w+)*?\\s*\\.\\s*(?:skip|skipIf|todo|only|fails)\\b',
  '(?:xit|xtest|xdescribe|fit|fdescribe)\\s*\\(',
  '(?:ctx|t|this)\\.skip\\(',
  "(?:it|test|describe)\\s*\\(\\s*(['\"`]).*?\\1\\s*,\\s*\\{[^}]*\\bskip\\s*:\\s*true",
].join('|') + ')')
const CASE = /(?:^|[^\w.])(?:it|test|bench|xit|xtest)\s*(?:\.\s*\w+(?:\([^)]*\))?\s*)*\(/
const ASSERTION = /\bexpect(?:\.soft|\.poll)?\s*\(|\bassert(?:\.\w+)?\s*\(|\bt\.(?:is|true|false|deepEqual|throws|assert)\w*\s*\(/g
// Only names whose direction is unambiguous: a bigger tolerance is always looser.
const TOLERANCE_NAME = /\b(?:tolerance|epsilon|eps|atol|rtol)\b|\b\w*_TOL\w*\b|\bTOL\w*\b/i
const NUMBER = /(?<![\w.$])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?![\w.])|(?<![\w.$])-?\.\d+(?:e[+-]?\d+)?(?![\w.])/gi

const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/
const code = lines => lines.filter(line => !COMMENT_LINE.test(line))
const TITLE = /(?:^|[^\w.])(?:it|test|bench|xit|xtest)\s*(?:\.\s*\w+(?:\([^)]*\))?\s*)*\(\s*(['"`])(.*?)\1/
const words = text => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
const similar = (a, b) => {
  const [x, y] = [words(a), words(b)]
  const shared = [...x].filter(word => y.has(word)).length
  return shared / Math.max(1, new Set([...x, ...y]).size) >= 0.5
}

/** Titles present before and gone after; a close rewording counts as a rename, not a removal. */
function missingTitles(removed, added) {
  const after = code(added).map(line => line.match(TITLE)?.[2]).filter(Boolean)
  const gone = []
  for (const title of code(removed).map(line => line.match(TITLE)?.[2]).filter(Boolean)) {
    const at = after.findIndex(candidate => candidate === title || similar(candidate, title))
    if (at >= 0) after.splice(at, 1)
    else gone.push(title)
  }
  return gone
}

const countMatches = (lines, pattern) => code(lines).reduce((total, line) => {
  const regex = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g')
  return total + (line.match(regex)?.length ?? 0)
}, 0)

// Matcher strictness. A drop in rank on the same subject is a weaker assertion.
const EXACT = new Set(['toBe', 'toEqual', 'toStrictEqual', 'toHaveLength', 'toBeCloseTo', 'toHaveBeenCalledWith',
  'toHaveBeenNthCalledWith', 'toHaveBeenLastCalledWith', 'toHaveBeenCalledTimes', 'toMatchSnapshot',
  'toMatchInlineSnapshot', 'toBeNull', 'toBeUndefined', 'toBeNaN', 'toStrictEqual', 'toThrowErrorMatchingInlineSnapshot'])
const PARTIAL = new Set(['toContain', 'toContainEqual', 'toMatchObject', 'toMatch', 'toBeInstanceOf', 'toHaveProperty',
  'toBeGreaterThan', 'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual', 'toThrow', 'toThrowError', 'toSatisfy'])
const rank = ({ negated, matcher }) => negated ? 1 : EXACT.has(matcher) ? 3 : PARTIAL.has(matcher) ? 2 : 1
// A negation only compares against the same matcher (toBe(1) -> not.toBe(2)); swapping
// toHaveBeenCalledWith(x) for not.toHaveBeenCalled() is a different claim, not a weaker one.
const comparable = (before, after) => before.negated === after.negated || before.matcher === after.matcher
const LOOSE_ARG = /\bexpect\.(?:any|anything|objectContaining|stringContaining|arrayContaining|stringMatching)\s*\(/

/** Split arguments at top-level commas. */
function splitArgs(text) {
  const parts = []
  let depth = 0
  let quote = ''
  let current = ''
  for (const char of text) {
    if (quote) { current += char; if (char === quote) quote = ''; continue }
    if ('\'"`'.includes(char)) { quote = char; current += char; continue }
    if ('([{'.includes(char)) depth++
    if (')]}'.includes(char)) depth--
    if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/** One assertion on a line: expect(subject).not.matcher(args), or a continuation ".matcher(args)". */
function parseAssertion(line) {
  const whole = line.trim().match(/^expect(?:\.soft)?\((.*)\)\s*\.\s*(not\s*\.\s*)?(\w+)\((.*)\)\s*;?\s*$/)
  if (whole) return { subject: whole[1].replace(/\s+/g, ''), negated: Boolean(whole[2]), matcher: whole[3], args: splitArgs(whole[4]) }
  const rest = line.trim().match(/^\.\s*(not\s*\.\s*)?(\w+)\((.*)\)\s*;?\s*$/)
  if (rest) return { subject: null, negated: Boolean(rest[1]), matcher: rest[2], args: splitArgs(rest[3]) }
  return null
}

const asNumber = text => (text !== undefined && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) ? Number(text) : null
const UPPER = new Set(['toBeLessThan', 'toBeLessThanOrEqual'])
const LOWER = new Set(['toBeGreaterThan', 'toBeGreaterThanOrEqual'])
const STRICT = new Set(['toBeLessThan', 'toBeGreaterThan'])

/** Why `after` asserts less than `before` on the same subject, or null. */
function weakening(before, after) {
  if (comparable(before, after) && rank(after) < rank(before)) return `${label(before)} became ${label(after)}`
  if (!before.negated && !after.negated && after.args.length <= before.args.length &&
      LOOSE_ARG.test(after.args.join(',')) && !LOOSE_ARG.test(before.args.join(','))) {
    return `${label(before)} now matches loosely (${after.args.join(', ').slice(0, 60)})`
  }
  if (before.negated || after.negated) return null
  const bound = (kind) => kind.has(before.matcher) && kind.has(after.matcher)
  const [b, a] = [asNumber(before.args[0]), asNumber(after.args[0])]
  if (b !== null && a !== null) {
    if (bound(UPPER) && (a > b || (a === b && STRICT.has(before.matcher) && !STRICT.has(after.matcher)))) {
      return `upper bound widened: ${before.matcher}(${before.args[0]}) -> ${after.matcher}(${after.args[0]})`
    }
    if (bound(LOWER) && (a < b || (a === b && STRICT.has(before.matcher) && !STRICT.has(after.matcher)))) {
      return `lower bound widened: ${before.matcher}(${before.args[0]}) -> ${after.matcher}(${after.args[0]})`
    }
  } else if ((bound(UPPER) || bound(LOWER)) && before.args[0] === after.args[0] &&
      STRICT.has(before.matcher) && !STRICT.has(after.matcher)) {
    return `bound relaxed: ${before.matcher} -> ${after.matcher} on ${before.args[0]}`
  }
  if (before.matcher === 'toBeCloseTo' && after.matcher === 'toBeCloseTo') {
    const [bd, ad] = [asNumber(before.args[1] ?? '2'), asNumber(after.args[1] ?? '2')]
    if (bd !== null && ad !== null && ad < bd) return `toBeCloseTo precision lowered from ${bd} to ${ad} digits`
  }
  return null
}

const label = ({ negated, matcher }) => `${negated ? 'not.' : ''}${matcher}`

/** A line pair that differs only in numbers, where a tolerance-named number grew. */
function toleranceWidened(before, after) {
  if (!TOLERANCE_NAME.test(before) || !TOLERANCE_NAME.test(after)) return null
  const skeleton = text => text.replace(NUMBER, '#').replace(/\s+/g, ' ').trim()
  if (skeleton(before) !== skeleton(after)) return null
  const [bn, an] = [before.match(NUMBER), after.match(NUMBER)]
  if (!bn || !an || bn.length !== an.length) return null
  const grew = bn.some((value, i) => Math.abs(Number(an[i])) > Math.abs(Number(value)))
  return grew ? `tolerance widened: ${before.trim()} -> ${after.trim()}` : null
}

/**
 * Findings in a (unified=0) diff of test files.
 * @returns {{ kind: string, file: string, detail: string }[]}
 * kinds: deleted-file, skipped, removed-tests, removed-assertions, weakened, widened
 */
export function analyzeTestDiff(diff, isTestFile = path => TEST_FILE.test(path)) {
  const findings = []
  for (const file of parseDiff(diff)) {
    if (!isTestFile(file.path) && !(file.deleted && isTestFile(file.oldPath ?? ''))) continue
    const add = ({ kind, detail }) => findings.push({ kind, file: file.path, detail })
    if (file.deleted) {
      add({ kind: 'deleted-file', detail: 'test file deleted' })
      continue
    }
    const removed = file.hunks.flatMap(hunk => hunk.removed)
    const added = file.hunks.flatMap(hunk => hunk.added)

    for (const line of added) {
      const match = line.match(SKIP)
      if (match) {
        const word = match[0].replace(/\s+/g, '')
        add({ kind: 'skipped', detail: `${/only|fit\(|fdescribe\(/.test(word) ? 'focused (silently skips the rest)' : 'skipped'}: ${line.trim().slice(0, 90)}` })
      }
    }

    // Titles, not counts: deleting one test and adding another in the same file nets to zero.
    const gone = missingTitles(removed, added)
    const casesRemoved = countMatches(removed, CASE) - countMatches(added, CASE)
    if (gone.length || casesRemoved > 0) {
      const names = gone.slice(0, 3).map(title => `"${title.slice(0, 50)}"`).join(', ')
      add({ kind: 'removed-tests', detail: `${Math.max(gone.length, casesRemoved)} test case(s) removed${names ? `: ${names}` : ''}` })
    }
    const assertionsRemoved = countMatches(removed, ASSERTION) - countMatches(added, ASSERTION)
    if (assertionsRemoved > 0) add({ kind: 'removed-assertions', detail: `${assertionsRemoved} fewer assertion(s)` })

    for (const hunk of file.hunks) {
      const unused = new Set(hunk.added.keys())
      for (const before of hunk.removed) {
        const b = parseAssertion(before)
        for (const index of unused) {
          const after = hunk.added[index]
          const a = parseAssertion(after)
          if (b && a && a.subject === b.subject) {
            unused.delete(index)
            const why = weakening(b, a)
            if (why) add({ kind: 'weakened', detail: `${why}: ${after.trim().slice(0, 90)}` })
            break
          }
          const why = !b && !a ? toleranceWidened(before, after) : null
          if (why) { unused.delete(index); add({ kind: 'widened', detail: why }); break }
        }
      }
    }
  }
  return findings
}

/** Combine the two gates' messages for the job summary. */
export function formatFindings(findings) {
  return findings.map(({ kind, file, detail }) => `${kind}  ${file}: ${detail}`)
}
