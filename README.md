# Codex Session Kit

Codex Session Kit is a lightweight VS Code extension for AI-heavy coding workflows. It gives each repository a small set of durable project-memory docs, then makes it easy to start an AI session by reading them first and finish a session by updating them.

The core habit it enforces is simple:

> AI should consume durable project context first, then update that context before leaving.

## What It Does

This MVP focuses on local workflow support, not API integrations.

- `Project Memory: Initialize Project Memory`
  - Creates `.vscode/ai-context.json` if it does not exist.
  - Creates any missing project-memory docs without overwriting human-written notes.
  - Scans the current workspace and populates managed sections with real repo data immediately.
- `Project Memory: Update Memory Docs Now`
  - Scans the current workspace and refreshes the managed sections inside all tracked memory docs.
  - Uses local repo signals such as package metadata, file layout, git status, recent file changes, and open editors.
  - When memory docs are updated, suggests a commit message like `docs: refresh project memory after auth refactor`.
- `Project Memory: Upgrade AI Context Config To Latest Defaults`
  - Rewrites `.vscode/ai-context.json` to the latest default role-aware `docs` format.
  - Useful for migrating an older path-only config to the current default structure quickly.
- `Project Memory: Generate Session Summary`
  - Creates a markdown handoff summary from changed files, recent commits, detected decision signals, and added TODO-style lines.
  - Offers to append suggested notes into the most relevant memory docs, especially current work and decisions.
- `Project Memory: Validate Memory Docs`
  - Checks for missing docs, stale docs, malformed managed sections, branch-switch drift, and docs that still look like placeholder-only starter text.
  - Opens a validation report so drift is visible before handoff.
- `Project Memory: Start Session From Project Memory`
  - Copies a reusable “read these docs first” prompt to the clipboard.
- `Project Memory: Finish Session And Update Project Memory`
  - Copies a reusable “update project memory before leaving” prompt to the clipboard.
- `Project Memory: Show Project Memory Status`
  - Opens a quick status document showing which configured memory files exist and when they were last refreshed.
- Codex activity-bar view
  - Adds a `Codex` sidebar with grouped actions, guide shortcuts, live file status, and refresh timestamps.
- Status bar indicator
  - Shows how many configured memory files exist in the current workspace, with branch-aware warning details in the tooltip.

## Default Files

By default the extension manages:

- `docs/repo-summary.md`
- `docs/architecture.md`
- `docs/current-work.md`
- `docs/refactor-roadmap.md`
- `docs/decisions.md`

## Workspace Config

The extension looks for `.vscode/ai-context.json` and uses it as the primary source of truth for which docs to read and maintain.

Example:

```json
{
  "docs": [
    {
      "path": "docs/repo-summary.md",
      "role": "repo-summary"
    },
    {
      "path": "docs/architecture.md",
      "role": "architecture"
    },
    {
      "path": "docs/current-work.md",
      "role": "current-work"
    },
    {
      "path": "docs/refactor-roadmap.md",
      "role": "refactor-roadmap"
    },
    {
      "path": "docs/decisions.md",
      "role": "decisions"
    }
  ]
}
```

Each doc can declare a `role` so prompts and auto-generated snapshots stay smart even when you use custom filenames like `docs/system-design.md` or `notes/hand-off.md`.

The extension still accepts the older path-only `docPaths` format for backward compatibility.

If that file does not exist, the extension falls back to the `codexSessionKit.docs` setting in VS Code, then to the legacy `codexSessionKit.docPaths` setting if needed.

The extension also writes `.vscode/ai-context-state.json` to track lightweight session metadata:

- When `Start Session From Project Memory` was last used
- When `Finish Session And Update Project Memory` was last used
- When each tracked memory doc was last refreshed
- Which git branch was last seen, and when the workspace most recently switched branches

“Last refreshed” means the last time a tracked memory doc was saved or created while the extension was active.

That state file is intended to be local workspace metadata and is git-ignored by default in this repo to avoid noisy timestamp-only diffs.

## Auto-Updating Memory Docs

`Project Memory: Initialize Project Memory` now does two things:

1. Creates any missing config and memory doc files.
2. Scans the current workspace and fills each doc's managed auto-generated section with real repo facts.

`Project Memory: Update Memory Docs Now` reruns that scan at any time without recreating the files.

The auto-generated sections are stored between hidden markers in each doc, so the extension can refresh factual snapshots without overwriting your human notes outside that managed block.

The updater currently uses local workspace signals including:

- `package.json` metadata and scripts
- top-level directory and file layout
- git branch and working tree changes when git is available
- recently modified files
- currently visible editors in VS Code
- shallow file-type and structure heuristics

## Branch Awareness

Codex Session Kit now keeps lightweight local branch awareness for larger repos.

When the extension notices that the workspace branch changed, it can warn:

```text
Project memory may be stale relative to the current branch.
```

How it works:

- The extension remembers the last observed git branch in `.vscode/ai-context-state.json`
- If the current branch changes, it records the switch and shows a warning once for that transition
- Validation and status surfaces keep showing the branch-switch warning until the tracked memory docs have been refreshed after the switch

This is especially helpful when `docs/current-work.md` or related handoff docs were accurate on one branch but no longer match the code you just checked out.

Important limitation:

The extension cannot directly read a private live Codex conversation or transcript. So when this README says it uses "current Codex session information," the practical implementation is local session context that VS Code can actually see, like open files and active repo changes.

## Faster Command Access

Using the `Project Memory` command category keeps these commands separate from built-in or other `Codex:` commands in the command palette.

The extension also includes default macOS shortcuts:

- `cmd+alt+.` for `Project Memory: Start Session From Project Memory`
- `cmd+alt+u` for `Project Memory: Update Memory Docs Now`
- `cmd+alt+v` for `Project Memory: Validate Memory Docs`
- `cmd+alt+/` for `Project Memory: Finish Session And Update Project Memory`
- `cmd+alt+shift+.` for `Project Memory: Initialize Project Memory`

If those conflict with your setup, you can remap them in VS Code keyboard shortcuts.

## Sidebar View

The extension adds a `Codex` icon to the VS Code activity bar.

Open that view and you will see:

- `Codex Session Kit` hero item that opens general documentation
- `Open Getting Started`
- `Open General Documentation`
- `Start Session From Project Memory`
- `Generate Session Summary`
- `Update Memory Docs Now`
- `Validate Memory Docs`
- `Finish Session And Update Project Memory`
- `Initialize Project Memory`
- `Show Project Memory Status`
- A live list of the configured memory docs, with missing files clearly marked
- Relative refresh timestamps like `just now`, `12m ago`, or `2d ago`

How to use it:

1. Click the `Codex` activity-bar icon.
2. Use `Initialize Project Memory` the first time you set up a repo.
3. Click `Start Session From Project Memory` when you begin a new AI conversation.
4. Use `Generate Session Summary` when you want a quick handoff summary and optional append suggestions for the memory docs.
5. Use `Update Memory Docs Now` whenever you want a fresh factual snapshot of the repo.
6. Use `Upgrade AI Context Config To Latest Defaults` when you want to migrate `.vscode/ai-context.json` to the current default role-aware structure.
7. Use `Validate Memory Docs` when you want the extension to flag missing, stale, or still-placeholder docs.
8. Click any listed doc to open it directly.
9. Click `Finish Session And Update Project Memory` when you want the AI to refresh the durable docs.
10. Use the refresh button in the view title if the file list looks stale.

Hover any doc in the sidebar to see:

- Full path
- Last refreshed timestamp
- Last modified timestamp

The bundled docs opened from the sidebar are:

- `docs/getting-started.md`
- `docs/general-documentation.md`

## Start-Session Prompt

The start command copies a prompt shaped like this:

```text
Before doing anything, read:
- docs/repo-summary.md (repo-summary)
- docs/architecture.md (architecture)
- docs/current-work.md (current-work)
- docs/refactor-roadmap.md (refactor-roadmap)
- docs/decisions.md (decisions)
Use those as the primary source of truth. Only inspect implementation files when needed.

Use the doc roles to prioritize what to read closely and which files to update later.
```

## Finish-Session Prompt

The finish command copies a prompt shaped like this:

```text
Review the changes made in this session.
Before updating the memory docs, scan the current folder for changed, added, or deleted files, including files that may have been modified manually outside this chat session.
Update the relevant docs in /docs so future AI sessions understand the current state, architecture, decisions, and next work.
Relevant project memory files: docs/repo-summary.md, docs/architecture.md, docs/current-work.md, docs/refactor-roadmap.md, docs/decisions.md.
Incorporate meaningful repo changes from both this chat session and any manual edits discovered during the folder scan.
Only update the files that changed meaningfully.
```

## Session Summary Command

`Project Memory: Generate Session Summary` creates a markdown summary that can include:

- changed files from git status
- recent commits, anchored to the last recorded start-session time when available
- decision-like signals inferred from commit subjects and related notes
- added `TODO`, `FIXME`, `HACK`, or `XXX` lines from the current diff

After generating the summary, the extension can optionally append:

- a concise working-session block into the current-work doc
- candidate decision follow-ups into the decisions doc

These appended notes are intentionally cautious. Decision detection is heuristic, so the extension suggests items to confirm rather than treating them as final architecture decisions automatically.

## Suggested Commit Messages

When the extension updates project memory docs, it can suggest a commit message without creating a commit automatically.

Example:

```text
Project memory updated.
Suggested commit:
docs: refresh project memory after auth refactor
```

The suggestion is heuristic. It prefers the current branch topic when available, and otherwise falls back to non-doc changed-file context.

## Refresh Tracking

Codex Session Kit now tracks when project-memory docs were last refreshed.

Where that shows up:

- In the sidebar, each doc shows a relative timestamp
- In `Project Memory: Show Project Memory Status`, each doc shows its last refreshed time
- In the status-bar tooltip, prompt usage and doc refresh times are summarized

How it works:

- Creating a missing memory doc records an initial refresh timestamp
- Running `Initialize Project Memory` or `Update Memory Docs Now` refreshes the managed auto-generated sections
- Saving a tracked memory doc updates its refresh timestamp
- Running the start and finish session commands records the last time those prompts were used

This is intentionally lightweight. It does not inspect the content quality of the docs or decide whether they are up to date semantically. It only records the most recent tracked refresh event.

## Validation

`Project Memory: Validate Memory Docs` adds a repo-level audit pass for memory drift.

It currently checks for:

- configured memory docs that are missing
- docs that have not been refreshed recently
- docs whose managed auto-generated section is missing or malformed
- docs whose human notes still look like untouched starter template text
- docs that were refreshed before newer repo file changes happened
- project memory that may be stale after a git branch switch

Where validation appears:

- a validation summary row in the sidebar
- a dedicated validation command that opens a markdown report

This validation is heuristic by design. It is meant to catch likely drift, not prove that the docs are semantically perfect.

## Do You Need To Run These Every Prompt?

Usually no.

For most AI tools, the start-session prompt should be used once at the beginning of a working conversation, not before every single follow-up prompt. After the model has loaded that context, you can keep working inside the same thread until something important changes.

The finish-session prompt should usually be used once near the end of the conversation, or any time you want to hand the project back to your future self or another AI session in a clean state.

## What Counts As The Same Session?

The extension does not try to detect Codex, Copilot, Claude, or Cursor session boundaries directly. In practice, treat it as the same session if you are still in the same uninterrupted AI conversation and the assistant still has the working context loaded.

You should run the start-session prompt again when:

- You open a new chat or thread.
- You switch to a different AI tool.
- The model loses context or starts behaving like it has not read the project docs.
- You come back after enough time that the conversation context is no longer trustworthy.
- You switch to a materially different task, branch, or architectural area.

If you are unsure, rerunning the start-session prompt is cheap and usually worth it.

## Good Fit

This is especially useful for:

- Long-running personal projects
- Client work
- AI-assisted development workflows
- Repos with lots of context
- Projects you revisit after weeks or months
- Teams using Codex, Copilot, Claude, Cursor-style tools

It is usually less useful for:

- Tiny scripts
- Throwaway experiments
- Simple libraries
- Repos that already have excellent durable docs

## How To Test Locally

1. Open this repo in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. In the new window, open a test repository.
4. Open the `Codex` activity-bar view.
5. Run `Initialize Project Memory`.
6. Open one of the generated docs and confirm the auto-generated snapshot section is populated.
7. Run `Update Memory Docs Now` after making file changes to see the snapshot refresh.
8. Run `Validate Memory Docs` to see whether any files are missing, stale, or still placeholders.
9. Run `Start Session From Project Memory` and paste the copied prompt into your AI tool.
10. Run `Finish Session And Update Project Memory` when you want the AI to refresh the docs.
11. Edit and save one of the tracked docs to see the refresh timestamp update in the sidebar.

## Build And Install

This project currently uses a zero-build setup.

- There is no TypeScript compile step.
- The extension entry point is `src/extension.js`.
- For local development, `F5` in VS Code is enough.

### Run Locally In VS Code

1. Open this repo in VS Code.
2. Press `F5`.
3. A new Extension Development Host window will open with this extension loaded.
4. Open the repo you want to test in that new window.

### Install As A VSIX

If you want to install the extension into a regular VS Code window instead of running it through the Extension Development Host, package it as a `.vsix`.

Prerequisites:

- Node.js installed
- `npm` available
- project dependencies installed with `npm install`

Install dependencies:

```bash
npm install
```

Run the lightweight extension checks:

```bash
npm run lint:extension
```

From the repo root, create the package with the npm script:

```bash
npm run package:vsix
```

If you prefer, the underlying command is still:

```bash
vsce package
```

That should generate a `.vsix` file for the current extension version.

The `.vsix` will include the bundled media assets in `media/`, including:

- `media/codex-session-kit.png` for the extension icon declared in `package.json`
- `media/codex-session-kit.webp` as an optional project asset you can reuse later once the public repository URL is configured

Then install it in VS Code using either method:

1. Command Palette
2. Run `Extensions: Install from VSIX...`
3. Choose the generated `.vsix` file

Or from the terminal:

```bash
code --install-extension <your-generated-vsix-file>
```

### Reinstall After Changes

If you update the extension code and want to retest the packaged version:

1. Run `npm run lint:extension`.
2. Run `npm run package:vsix`.
3. Reinstall the new `.vsix`.
4. Reload VS Code.

For faster iteration during development, using `F5` is still the better path.

### Available Scripts

- `npm run lint:extension`
  - Syntax-checks `src/extension.js` and validates that `package.json` parses cleanly.
- `npm run package:vsix`
  - Packages the extension into a `.vsix` using the local `vsce` dependency.
- `npm run publish:check`
  - Runs Marketplace publishing preflight checks.
- `npm run publish:vsix`
  - Runs preflight plus packaging as a one-shot publish-prep flow.
- `npm run publish:marketplace`
  - Runs preflight checks, then publishes with `vsce publish`.

If you want to use `vsce` directly instead of the npm script, you can still run it through `npx`:

```bash
npx vsce package
```

### Notes On Publishing

This repo is ready for local packaging, but it does not yet include a Marketplace publishing setup.

There is now a dedicated publishing guide at [docs/publishing-vscode-marketplace.md](/Users/jasonp/repos/codex-session-kit/docs/publishing-vscode-marketplace.md).

Marketplace asset notes:

- `package.json` now declares `media/codex-session-kit.png` as the extension icon
- `media/codex-session-kit.webp` is kept in the repo, but it is not currently referenced from `README.md` because `vsce` needs a real public repository URL to rewrite relative README image paths safely
- Once you create the public GitHub repo and add `repository` to `package.json`, you can add the WebP preview image back to the README if you want

If you later want to publish it publicly, the usual next steps are:

- choose a real `publisher` value in `package.json`
- create a Visual Studio Marketplace publisher
- add an icon, license details, and release workflow
- run `vsce publish` instead of just `vsce package`

## Drift

This is a good way to reduce drift, but it is not the whole solution.

The best setup is hybrid:

- Let the extension keep factual repo signals fresh automatically
- Let validation warn you when the docs have likely drifted
- Keep human-maintained notes for architecture intent, decisions, tradeoffs, and next steps
- Use the start and finish session prompts so the AI reads those docs and then updates them before handoff

Code scanning is good at detecting structure, changed files, and metadata. It is not good at inferring why a decision was made, whether a refactor is half-finished intentionally, or which tradeoff matters most. That is why managed auto-generated sections plus human notes is safer than trying to make the docs fully automatic.

## Roadmap Ideas

- Support alternate prompt templates for different AI tools.
- Offer optional insertion into an editor instead of clipboard-only behavior.
- Add configurable validation rules or stale thresholds per repo.
