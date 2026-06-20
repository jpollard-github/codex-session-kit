# Architecture

## System shape
- This repo currently contains a single VS Code extension implemented in plain CommonJS JavaScript.
- The extension activates from command usage and manages project-memory docs in the active workspace.
- The extension now also performs repo scanning for auto-generated memory snapshots, validation checks, and packaging/publishing preflight support.

## Important directories
- `src/` contains the extension activation and command logic.
- `docs/` contains the durable project-memory files that the extension encourages other repos to maintain.
- `.vscode/ai-context.json` defines which project-memory docs are considered the source of truth for prompts, and can attach semantic roles to those docs.
- `scripts/` contains repo maintenance helpers such as Marketplace publish preflight checks.
- `media/` contains assets for the activity bar, extension icon, and optional project imagery.

## Runtime flow
- A user runs a command from the command palette.
- The extension resolves the primary workspace folder, reads `.vscode/ai-context.json` when present, and derives the configured memory files plus any declared doc roles.
- The initialize command creates any missing docs and starter templates.
- The update command rescans the workspace and refreshes managed sections inside the memory docs.
- The validate command checks for missing, stale, malformed, or still-placeholder memory docs and opens a report.
- The extension stores lightweight local branch metadata and can flag project memory as stale after a branch switch until docs are refreshed on the new branch.
- The start and finish commands build prompt text and copy it to the clipboard.
- A session-summary command can synthesize repo handoff notes from local git state, commits, heuristics, and TODO additions, then append suggested notes into human-maintained memory sections.
- Project-memory update flows can also suggest a commit message derived from the current branch or changed-file context, without invoking git commit automatically.
- Auto-generated doc snapshots can be chosen by declared role, not only by file name, so custom paths can still behave like architecture/current-work/decisions docs.
- The activity-bar view is intentionally organized into learning, workflow, health, setup, and tracked-doc sections to make the extension easier to navigate.
- The status command and status bar summarize which docs are present.

## Integration points
- VS Code command registration
- VS Code clipboard API
- VS Code status bar API
- Workspace filesystem via Node `fs`
- Local git status via `child_process`
- Local `vsce` packaging and Marketplace preflight through npm scripts

## Constraints
- This MVP does not integrate directly with Codex or any other AI provider API.
- Session boundaries are intentionally human-defined rather than automatically detected.
- The current implementation assumes the first workspace folder is the active project root.
- Validation is heuristic: it can catch likely drift, but not guarantee semantic correctness of the docs.

<!-- codex-session-kit:auto-start -->
> Auto-generated snapshot. Refreshed 6/20/2026, 6:27:43 PM. This section is managed by Codex Session Kit.

## Auto Snapshot

### Top-level structure
- `.vscode/`
- `docs/`
- `media/`
- `scripts/`
- `src/`

### File mix
- .md: 10
- .json: 5
- .js: 2
- [no extension]: 1
- .png: 1
- .svg: 1
- .webp: 1

### Likely integration points
- Primary entry point appears to be `./src/extension.js`.
- The repo keeps durable docs in `docs/`, which are part of the intended workflow.
- Static media/assets are stored in `media/`.

### Architectural notes from scan
- Implementation code appears to live under `src/`.
- Workspace-specific configuration is present under `.vscode/`.
- Documentation is stored as first-class repo content under `docs/`.
- A shallow scan did not find an obvious test directory.
<!-- codex-session-kit:auto-end -->
