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

## Rejected options
- Building provider-specific API integrations as part of the MVP.
- Requiring prompt injection before every single AI message.
- Treating the extension's own state/config files as evidence that memory docs are stale.

<!-- codex-session-kit:auto-start -->
> Auto-generated snapshot. Refreshed 6/20/2026, 5:31:31 PM. This section is managed by Codex Session Kit.

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
