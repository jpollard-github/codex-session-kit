# Decisions

## Decision Log
- Date: 2026-06-21
- Decision: Pivot the product to a handoff-first workflow with one generated snapshot plus human-maintained handoff docs.
- Context: The previous workflow generated multiple role-specific snapshots, but those outputs were often shallow repo telemetry instead of durable project memory.
- Consequences: The tool is narrower but more honest. Initialization and update flows should create better handoff prompts, while generated content is limited to evidence the user can review.

## Decision Log
- Date: 2026-06-20
- Decision: Start with a zero-build plain JavaScript VS Code extension MVP.
- Context: The first goal is to validate the workflow quickly in local VS Code projects without adding TypeScript or packaging overhead.
- Consequences: The code is easy to run immediately, but type safety and test ergonomics are lighter than a full TypeScript setup.

## Decision Log
- Date: 2026-06-20
- Decision: Use clipboard-based prompts instead of direct AI integrations.
- Context: The product value is the workflow habit and durable docs, not provider coupling.
- Consequences: The extension is broadly compatible, but users still need to paste prompts into their AI tool manually.

## Decision Log
- Date: 2026-06-20
- Decision: Keep decision detection and README-review detection heuristic.
- Context: Handoff summaries and README suggestions are useful, but the extension still cannot infer semantic truth with confidence.
- Consequences: The tool can accelerate handoffs and documentation review, while the final judgment stays with the user.
