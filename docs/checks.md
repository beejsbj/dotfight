# Checks, hooks and PR gates

What runs where, so a change is checked before it merges and a PR carries its evidence.

| Where | What runs | Source |
|---|---|---|
| `git commit` (pre-commit hook) | `npm run lint`, `npm run typecheck`, and the Vitest tests related to the staged files. Docs-only commits skip all three. | `.githooks/pre-commit`, `scripts/pre-commit.mjs` |
| `git push` (pre-push hook) | the privacy scan over what the push adds | `.githooks/pre-push`, `scripts/privacy/` |
| Every PR and push to `main` | `ci`: lint, typecheck, the script tests, the full test suite, the production build | `.github/workflows/ci.yml` |
| Every PR | `verification-section`, `test-integrity` (re-run when the description is edited) | `.github/workflows/pr-gates.yml`, `scripts/pr-gates/` |
| Every PR, and push to `main` | `privacy-scan`: personal paths, emails and identities, and a `LICENSE` | `.github/workflows/privacy.yml`, `scripts/privacy/` |
| Every PR | `review-evidence`: every review thread resolved, with a reply that shows why | `.github/workflows/review-evidence.yml` |

## The hook

`npm install` / `npm ci` runs `prepare`, which sets `core.hooksPath=.githooks` (`scripts/install-hooks.mjs`). The setting lives in the repository's shared git config, so every worktree of the checkout gets the hook once it has installed dependencies. A commit in a worktree with no `node_modules` fails with an instruction to run `npm ci`; it does not skip quietly. The installer does nothing in CI, on Vercel, outside a git checkout, or when `core.hooksPath` is already set to something else.

The hook runs the package scripts' own commands. On a machine that meters heavy jobs, set `PRE_COMMIT_RUNNER` to the metering command (for example `t3-test-run`) and every check runs behind it. Skip once with `git commit --no-verify`; CI is the backstop.

## Lint: Biome, baselined

`npm run lint` is `biome lint --error-on-warnings .`. The repo had no linter, so `biome.jsonc` turns on the recommended rules and switches off, in one list, the rules the existing code already breaks. That list is the baseline: **new violations of every other rule fail; the switched-off rules are not enforced anywhere**. Each switched-off rule carries the count it had when the baseline was cut, so it can be re-enabled and fixed one rule at a time. Only linting is wired; the formatter is off (formatting the whole code base would be one huge diff for no gain here).

## Gate 1: a Verification section

The PR description must contain a `## Verification` section with at least 30 characters that are not a placeholder: the commands you ran and what they showed, or `Not run: <why>`. The PR template (`.github/pull_request_template.md`) has the heading.

## Gate 2: tests deleted, skipped or loosened

The check diffs every test file (`*.test.*`, `*.spec.*`, anything under `__tests__/`) against the PR's merge-base and fails when it finds a deleted test file, an added `.skip` / `.todo` / `.only`, a removed test case or assertion, a weaker matcher, or a wider tolerance, unless the description carries one line: `Test change: <why this is right>` (20 or more characters). The heuristics are line-based, tuned on a Vitest repo's history, and measured on this repo's own history (see the PR that added them).

**What the gates miss.** A skip written mid-line, a loosening spread over several lines, a weaker assertion in a helper, a mock that now returns what the test expects, a raised timeout, coverage or exclude settings in `vitest.config.ts`, and tests moved outside the test glob. They guard against accidents, not adversaries: a PR can edit `scripts/pr-gates/`, `scripts/privacy/` or the workflows, so review of those paths matters. Tests for the gates are `scripts/pr-gates/pr-gates.test.mjs`, run by `npm run test:scripts`.

## Privacy and licence

The repo is public, and a closed PR or a deleted branch stays fetchable. `privacy-scan` fails on a home-directory path, a machine mount, or an email address in what any commit of a PR adds (even one a later commit removes), in file names, in commit author lines and messages, and in the PR description; on `main` it scans the whole tree. It also fails when `LICENSE` is missing. Commit as the GitHub noreply address (see `AGENTS.md`).

The scanner holds no personal identifier. Names and hostnames that are private live in the `PRIVACY_PATTERNS` Actions secret in CI and in `~/.config/privacy-scan/patterns` on the owner's machines. Until the secret exists, CI runs the structural rules only. It misses `user@host` prompts, values in images and binaries, obfuscated or split addresses, history before the PR, and placeholder first names. A real public exception goes in `.github/privacy-allow.txt` with the narrowest rule.

## Making the checks required

A failing workflow does not block a merge on its own: the default branch's ruleset has to require the checks. They are `ci`, `verification-section`, `test-integrity`, `privacy-scan` and `review-evidence`, with conversations resolved before merge. A repository admin applies the baseline ruleset (cockpit issue 62); until then they report but do not stop a merge.

Practice note: write to practice.person@mailbox-practice.dev for details.
