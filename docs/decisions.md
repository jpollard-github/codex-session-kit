# Decisions

## Decision log
- Date: 2026-06-20
- Decision: Start with a zero-build plain JavaScript VS Code extension MVP.
- Context: The first goal is to validate the workflow quickly in local VS Code projects without adding TypeScript or packaging overhead.
- Consequences: The code is easy to run immediately, but type safety and test ergonomics are lighter than a full TypeScript setup.

## Decision log
- Date: 2026-06-20
- Decision: Use clipboard-based prompts instead of direct AI integrations.
- Context: The product value is the workflow habit and durable docs, not provider coupling.
- Consequences: The extension is broadly compatible, but users still need to paste prompts into their AI tool manually.

## Decision log
- Date: 2026-06-20
- Decision: Use managed auto-generated sections inside memory docs rather than rewriting the whole file.
- Context: The extension now scans the workspace and refreshes factual repo context, but users still need durable human-written notes that survive those refreshes.
- Consequences: The extension can update docs repeatedly with lower overwrite risk, but validation has to reason about both managed and human-maintained sections.

## Decision log
- Date: 2026-06-20
- Decision: Add repo-level validation and Marketplace publishing preflight as built-in helper workflows.
- Context: Once the extension started generating and refreshing docs automatically, drift detection and publish-readiness checks became a natural part of the tool's value.
- Consequences: The extension now covers more of the repo lifecycle, but `src/extension.js` has become denser and will likely need modularization later.

## Decision log
- Date: 2026-06-20
- Decision: Support role-aware project-memory doc config in `.vscode/ai-context.json`.
- Context: Path-only config works for the default docs, but custom doc names make prompts and auto-generated snapshots less useful unless the extension knows each doc's semantic purpose.
- Consequences: The extension can preserve smart prompting and role-specific snapshots with custom file layouts, while still accepting legacy `docPaths` config for backward compatibility.

## Decision log
- Date: 2026-06-20
- Decision: Track lightweight git branch transitions in local state and warn when memory docs may be stale after a branch switch.
- Context: In larger repos, `current-work` and similar handoff docs can become misleading when a user checks out a different branch without refreshing memory docs.
- Consequences: The extension can surface branch-aware drift in warnings, status, and validation without adding any provider-specific integration, but the implementation remains heuristic and depends on local git visibility.

## Decision log
- Date: 2026-06-20
- Decision: Add a session-summary command that can suggest doc updates, but keep decision detection explicitly heuristic.
- Context: Handoff summaries are useful, but automatically promoting inferred commit or diff signals into durable architecture decisions would be too aggressive for the MVP.
- Consequences: The extension can accelerate handoffs by generating summaries and candidate follow-ups, while still leaving final decision framing to the user or AI session that reviews those suggestions.

## Decision log
- Date: 2026-06-20
- Decision: Suggest commit messages after project-memory updates, but never create commits automatically.
- Context: A lightweight commit suggestion fits the handoff workflow and makes doc refreshes easier to package, without crossing into git automation that could feel intrusive.
- Consequences: The extension can reinforce a clean docs-update workflow while keeping the final commit boundary fully user-controlled.

## Decision log
- Date: 2026-06-20
- Decision: Add bundled Getting Started and General Documentation guides, and surface them directly in the sidebar.
- Context: The extension's workflow is stronger when users can learn both the practical steps and the philosophy behind durable project memory without leaving the product surface.
- Consequences: The sidebar becomes more useful as an onboarding surface, and the extension carries its own end-user guidance in a packaged, offline-friendly form.

## Rejected options
- Building provider-specific API integrations as part of the MVP.
- Requiring prompt injection before every single AI message.
- Treating the extension's own state/config files as evidence that memory docs are stale.

<!-- codex-session-kit:auto-start -->
> Auto-generated snapshot. Refreshed 6/20/2026, 6:27:43 PM. This section is managed by Codex Session Kit.

## Auto Snapshot

### Durable facts worth confirming
- Package name: `codex-session-kit`
- Display name: Codex Session Kit
- Description: Bootstrap durable project memory for Codex and other AI coding workflows.
- Current branch during scan: `main`

### Suggested human follow-up
- Promote important implementation choices from current work into explicit decision log entries.
- Use this file for decisions and consequences that cannot be inferred safely from code scanning alone.
<!-- codex-session-kit:auto-end -->
