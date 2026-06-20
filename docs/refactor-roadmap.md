# Refactor Roadmap

## Problem areas
- Prompt generation and filesystem logic currently live in one extension file.
- Validation, repo scanning, status reporting, and publishing helpers are still concentrated in one extension file.

## Planned improvements
- Split config, template, and prompt logic into smaller modules once the workflow settles.
- Add tests around config resolution and file creation behavior.
- Introduce a richer project-memory status view if users want more than the status bar.
- Separate validation rules and repo-scan heuristics into their own module once the extension behavior stabilizes.
- Consider filtering ignored build artifacts out of repo-scan summaries if they become noisy.

## Sequencing
- Validate the MVP workflow with real projects first.
- Refactor after the command surface and config shape feel stable.
- Keep publish-helper ergonomics simple until the real Marketplace release flow is exercised once.

## Watchouts
- Avoid adding AI-provider-specific assumptions too early.
- Keep setup friction low so testing in other repos stays simple.
- Avoid validation rules that mark docs stale because of the extension's own bookkeeping or packaging artifacts.

<!-- codex-session-kit:auto-start -->
> Auto-generated snapshot. Refreshed 6/20/2026, 5:31:31 PM. This section is managed by Codex Session Kit.

## Auto Snapshot

### Potential refactor signals
- Add tests or validation coverage if this repo is expected to evolve over time.
- One or more larger JS/TS files may be worth splitting if responsibilities keep growing.
- README is changing alongside implementation; ensure durable docs stay aligned with user-facing docs.

### Large code files
- src/extension.js (43 KB)

### Testing and maintenance gaps
- No obvious test directory detected.
- There are local changes, so docs may need a refresh before handoff.
<!-- codex-session-kit:auto-end -->
