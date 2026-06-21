# General Documentation

![Codex Session Kit](../media/codex-session-kit.webp)

## Philosophy

Codex Session Kit is built around one practical belief:

> repo scans are evidence, not understanding.

The extension is most useful when it helps a human or AI session produce a better handoff, not when it generates lots of shallow text.

## Product Shape

The product now separates two kinds of information:

1. Human-maintained handoff docs
2. Machine-generated repo telemetry

Human docs are where meaning lives:

- repo purpose
- active work
- decisions
- risks
- next task

Machine telemetry is where evidence lives:

- changed files
- branch state
- recent file activity
- package metadata
- coarse repo structure

## Why This Changed

The earlier workflow updated multiple docs with factual snapshots, but that output was often too shallow to be trusted as durable project memory.

The handoff-first workflow is narrower:

- refresh one machine snapshot
- draft one useful handoff
- update only the human docs that matter
- optionally review README.md when user-facing behavior changed

## Two Similar Commands, Different Jobs

The extension has two related commands on purpose:

- `Prepare Handoff Review`
  - refreshes the machine snapshot first
  - gives you a review/checklist view
  - is best when you are still deciding what matters
- `Generate Session Handoff`
  - gives you the cleaner summary output
  - is best when you want wording you can keep, paste, or append

They use many of the same repo signals, but they are for different moments:

- review first
- handoff second

## What Validation Means Now

Validation is about usefulness, not just activity.

The extension now tries to catch:

- missing tracked docs
- untouched starter templates
- stale handoff notes after real code changes
- malformed snapshot sections
- branch-switch drift
- likely README review needs

It still does not claim semantic certainty.

## What Success Looks Like

The extension is doing its job when:

- a fresh AI thread starts with fewer dumb suggestions
- future-you can re-enter the repo quickly
- current-work notes capture what matters, not just what moved
- the snapshot helps review changes without pretending to be architecture
