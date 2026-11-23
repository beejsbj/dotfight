#!/usr/bin/env node
// PR gate: the description must carry a "## Verification" section.
// Reads the body from $PR_BODY (never interpolated into a shell line).
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { checkVerification } from './lib.mjs'

export function run(body = process.env.PR_BODY ?? '') {
  const result = checkVerification(body)
  if (!result.ok) {
    console.log(`::error title=Verification section::${result.reason}`)
    console.error(result.reason)
  } else {
    console.log('Verification section present.')
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Verification section\n${result.ok ? 'Present.' : result.reason}\n`)
  }
  return result.ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = run()
