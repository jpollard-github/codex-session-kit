# Project Brief

## Repo Purpose
- `codex-session-kit` is a VS Code extension for durable AI handoffs.
- Its main job is to help a repo leave short, accurate notes that future Codex sessions can trust.

## How To Work In This Repo
- Treat README as the user-facing product contract.
- Keep the extension lightweight and runnable without a build step.
- Update the tracked docs when the product workflow changes materially.

## Important Constraints
- No provider-specific AI integration in the MVP.
- Machine-generated output should be repo telemetry only, not fake architectural certainty.
- Human-maintained docs remain the source of truth for meaning, priorities, and decisions.

## Architecture Rules Worth Preserving
- The extension is still a single CommonJS VS Code entrypoint at `src/extension.js`.
- `.vscode/ai-context.json` remains the source of truth for tracked doc paths and roles.
- Branch-awareness, validation, and session-handoff generation should stay conservative and review-oriented.
