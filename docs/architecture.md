# Architecture

## System shape
- This repo currently contains a single VS Code extension implemented in plain CommonJS JavaScript.
- The extension activates from command usage and manages project-memory docs in the active workspace.
- The extension now also performs repo scanning for auto-generated memory snapshots, validation checks, and packaging/publishing preflight support.

## Important directories
- `src/` contains the extension activation and command logic.
- `docs/` contains the durable project-memory files that the extension encourages other repos to maintain.
- `.vscode/ai-context.json` defines which project-memory docs are considered the source of truth for prompts.
- `scripts/` contains repo maintenance helpers such as Marketplace publish preflight checks.
- `media/` contains assets for the activity bar, extension icon, and optional project imagery.

## Runtime flow
- A user runs a command from the command palette.
- The extension resolves the primary workspace folder, reads `.vscode/ai-context.json` when present, and derives the configured memory files.
- The initialize command creates any missing docs and starter templates.
- The update command rescans the workspace and refreshes managed sections inside the memory docs.
- The validate command checks for missing, stale, malformed, or still-placeholder memory docs and opens a report.
- The start and finish commands build prompt text and copy it to the clipboard.
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
> Auto-generated snapshot. Refreshed 6/20/2026, 5:31:31 PM. This section is managed by Codex Session Kit.

## Auto Snapshot

### Top-level structure
- `.vscode/`
- `docs/`
- `media/`
- `scripts/`
- `src/`

### File mix
- .md: 8
- .json: 4
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
