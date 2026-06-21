# Codex Session Kit

Codex Session Kit is a lightweight VS Code extension for AI-heavy coding workflows. Its job is simple:

> help you leave a short, accurate handoff that future Codex can actually use.

The extension no longer tries to pretend shallow repo scans are durable documentation. Instead, it separates machine-generated repo telemetry from human-maintained handoff notes.

## What It Does

- `Project Memory: Initialize Handoff Docs`
  - Creates `.vscode/ai-context.json` if it does not exist.
  - Creates a lean default doc set:
    - `docs/project-brief.md`
    - `docs/current-work.md`
    - `docs/decisions.md`
    - `docs/project-memory-snapshot.md`
  - Fills only the snapshot file automatically.
- `Project Memory: Prepare Handoff Review`
  - Refreshes the machine-generated snapshot.
  - Opens a working review/checklist document with:
    - what changed
    - likely files to review
    - candidate notes worth confirming
    - questions to answer before writing the final handoff
    - README review suggestions when user-facing behavior likely changed
- `Project Memory: Generate Session Handoff`
  - Creates the cleaner, reusable handoff draft from git status, recent commits, decision-like signals, and TODO-style additions.
  - Can append suggested notes into `current-work.md` and `decisions.md`.
  - Can prompt you to review `README.md` when changes look material to users.
- `Project Memory: Validate Memory Docs`
  - Checks whether the tracked docs still look usable.
  - Flags missing docs, starter-template docs, malformed snapshot sections, branch-switch drift, and likely review gaps.
- `Project Memory: Start Session From Project Memory`
  - Copies a prompt that tells Codex to read the tracked docs first.
- `Project Memory: Finish Session And Update Project Memory`
  - Copies a finish prompt that explicitly asks for a concise handoff and a README update when user-facing changes are material.

## Default Files

By default the extension tracks:

- `docs/project-brief.md`
- `docs/current-work.md`
- `docs/decisions.md`
- `docs/project-memory-snapshot.md`

The first three are human-maintained. The snapshot is machine-generated telemetry.

## Why This Shape

The old version generated “smart” content into multiple docs, but most of that output was really repo telemetry:

- changed files
- branches
- recent files
- package metadata
- open editors

That information is still useful, but it should not masquerade as architecture or current-work truth.

The new workflow is handoff-first:

1. Read the docs before a fresh AI session.
2. Do the work.
3. Run `Prepare Handoff Review` to refresh the snapshot and sanity-check what changed.
4. Run `Generate Session Handoff` when you want the cleaner summary to keep, paste, or append.
5. Save the durable human notes that future-you will actually care about.

## Which Command To Use

- Use `Project Memory: Prepare Handoff Review` when you want a checkpoint.
  - It refreshes the machine snapshot first.
  - It is better for asking “what should I capture?” than for producing the final wording.
- Use `Project Memory: Generate Session Handoff` when you want the final draft.
  - It does not exist mainly to refresh telemetry.
  - It is better for a reusable summary you might paste into a future Codex session or append into `current-work.md`.

## Example Start Prompt

```text
Before doing anything, read:
- docs/project-brief.md (project-brief)
- docs/current-work.md (current-work)
- docs/decisions.md (decisions)
- docs/project-memory-snapshot.md (project-memory-snapshot)
Use those as the primary source of truth. Only inspect implementation files when needed.

Use the doc roles to prioritize what to read closely and which files to update later.
```

## Example Finish Prompt

```text
Review the changes made in this session.
Before updating the memory docs, scan the current folder for changed, added, or deleted files, including files that may have been modified manually outside this chat session.
Write or update a concise handoff so future AI sessions understand what changed, why it changed, what to preserve, and what to do next.
Relevant project memory files: docs/project-brief.md, docs/current-work.md, docs/decisions.md, docs/project-memory-snapshot.md.
Incorporate meaningful repo changes from both this chat session and any manual edits discovered during the folder scan.
Only update the files that changed meaningfully.
If the repo has a README.md and user-facing behavior changed materially, update the README too.
```

## What “Useful” Means

This extension is useful when it helps with at least one of these:

- Codex starts smarter in a fresh thread.
- Codex makes fewer repo-specific mistakes.
- Future-you re-enters the repo faster.

If it only refreshes files and timestamps, it is not doing its job.

## Local Development

- `npm run lint:extension`
- `npm run publish:check`
- `npm run package:vsix`

## Current Limitations

- No automated tests yet.
- Validation is heuristic.
- Multi-root workspaces still use the first folder only.
- Commit suggestions are intentionally conservative and may be omitted when the session theme is unclear.
