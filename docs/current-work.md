# Current Work

## In progress
- Hardening the MVP command set around repo scanning, validation, and publishing prep.
- Refining the project-memory workflow so drift is visible and packaging is easier.
- Adding role-aware doc configuration so custom memory file paths still produce smart prompts and updates.
- Adding branch-aware stale-memory warnings so repo handoff docs stay trustworthy across git checkouts.
- Adding a session-summary command to turn local git/worktree activity into handoff notes and suggested doc updates.
- Adding suggested commit messages after project-memory updates so docs refreshes are easier to package cleanly.
- Polishing the sidebar into clearer grouped sections and adding bundled end-user guides for onboarding and philosophy.

## Next up
- Test the commands in an Extension Development Host against a real repo.
- Decide whether clipboard-only prompts are enough or whether editor insertion should be optional.
- Add root files like `CHANGELOG.md` and any remaining Marketplace polish before first public publish.
- Consider whether configurable validation thresholds or rules should be per-repo settings.

## Known issues
- No automated tests yet.
- Marketplace publishing still needs a real publisher id instead of `local-dev`.
- Multi-root workspaces currently use the first folder only.
- Validation can still produce heuristic false positives if the repo has unusual memory-doc workflows.

## Active branches or PRs
- Local packaging, publishing-prep, and validation work only.

<!-- codex-session-kit:auto-start -->
> Auto-generated snapshot. Refreshed 6/20/2026, 6:27:43 PM. This section is managed by Codex Session Kit.

## Auto Snapshot

### Current repo activity
- Active git branch: `main`
- Working tree has 11 changed file(s).

### Changed files
- M .gitignore
- M .vscode/ai-context.json
- M README.md
- M docs/architecture.md
- M docs/current-work.md
- M docs/decisions.md
- M docs/repo-summary.md
- M package.json
- M src/extension.js
- ?? docs/general-documentation.md
- ?? docs/getting-started.md

### Open editors
- `.gitignore`

### Recently modified files
- .gitignore (6/20/2026, 6:27:16 PM)
- .vscode/ai-context-state.json (6/20/2026, 6:25:53 PM)
- package.json (6/20/2026, 6:24:27 PM)
- README.md (6/20/2026, 6:23:54 PM)
- src/extension.js (6/20/2026, 6:23:47 PM)
- docs/decisions.md (6/20/2026, 6:17:13 PM)
- docs/current-work.md (6/20/2026, 6:17:06 PM)
- docs/architecture.md (6/20/2026, 6:17:02 PM)
- docs/repo-summary.md (6/20/2026, 6:16:54 PM)
- docs/general-documentation.md (6/20/2026, 6:16:38 PM)
- docs/getting-started.md (6/20/2026, 6:16:19 PM)
- .vscode/ai-context.json (6/20/2026, 5:51:13 PM)
<!-- codex-session-kit:auto-end -->
