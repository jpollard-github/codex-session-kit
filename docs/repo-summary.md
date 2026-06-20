# Repo Summary

## What this project is
- `codex-session-kit` is a VS Code extension project for durable AI session bootstrapping.
- It helps a repo define its purpose, architecture, active work, decisions, and planned refactors in stable markdown files.
- The extension is meant to work especially well with Codex prompts and session handoffs.
- Project memory config can now assign semantic roles to docs so prompts and updates stay useful even when file paths are customized.
- The extension also tracks lightweight branch awareness so it can warn when project memory may be stale after switching branches.
- The extension can generate a markdown session summary from git/worktree signals and suggest appending relevant notes into memory docs.
- The extension can suggest a commit message after project-memory updates without creating a git commit automatically.
- The sidebar now includes grouped workflow sections plus direct shortcuts to bundled Getting Started and General Documentation guides.
- It now also includes repo-level validation, local packaging helpers, and Marketplace publishing prep for the VS Code extension workflow.

## Who it is for
- Developers using AI coding tools across longer-running repositories.
- Individuals or teams who want better continuity between AI-assisted coding sessions.

## Current goals
- Ship a small MVP that is easy to test locally in VS Code.
- Keep the first version focused on commands, templates, validation, and packaging instead of AI provider integrations.
- Smooth out the path from local testing to `.vsix` packaging and eventual Marketplace publishing.

## How to work in this repo
- Treat the README as the product overview and user-facing explanation.
- Keep the extension lightweight and easy to run without a build step.
- Update the docs in `docs/` when product scope or behavior changes.
- Preserve the split between managed auto-generated memory sections and human-maintained notes.

## Key links
- Local extension entry point: `src/extension.js`
- Workspace config: `.vscode/ai-context.json`
- Marketplace publishing guide: `docs/publishing-vscode-marketplace.md`
- Publish preflight helper: `scripts/publish-preflight.js`

<!-- codex-session-kit:auto-start -->
> Auto-generated snapshot. Refreshed 6/20/2026, 6:27:43 PM. This section is managed by Codex Session Kit.

## Auto Snapshot

### What this project appears to be
- Display name: Codex Session Kit
- Bootstrap durable project memory for Codex and other AI coding workflows.
- Package id: `codex-session-kit`

### Repo signals
- Workspace: `codex-session-kit`
- README title: Codex Session Kit
- Version: `0.2.0`
- Extension/main entry: `./src/extension.js`
- Tracked memory docs: `docs/repo-summary.md`, `docs/architecture.md`, `docs/current-work.md`, `docs/refactor-roadmap.md`, `docs/decisions.md`

### Key files and directories
- Directory: `.vscode/`
- Directory: `docs/`
- Directory: `media/`
- Directory: `scripts/`
- Directory: `src/`
- File: `.gitignore`
- File: `.vscode/ai-context-state.json`
- File: `.vscode/ai-context.json`
- File: `.vscode/launch.json`
- File: `LICENSE.md`
- File: `README.md`

### Package scripts
- `lint:extension`
- `package:vsix`
- `publish:check`
- `publish:vsix`
- `publish:marketplace`
<!-- codex-session-kit:auto-end -->
