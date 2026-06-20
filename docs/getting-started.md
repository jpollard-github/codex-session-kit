# Getting Started

![Codex Session Kit](../media/codex-session-kit.webp)

Codex Session Kit helps you build a repeatable habit:

1. Load durable project context before a new AI session starts.
2. Update that durable context before the session ends.

That sounds small, but it fixes one of the biggest frustrations in AI-assisted coding: losing the reasoning, tradeoffs, and active work context between sessions.

## What To Expect

This extension does not talk directly to an AI provider.

Instead, it helps you maintain a small set of repo docs that act as durable memory for you and your AI tool:

- `docs/repo-summary.md`
- `docs/architecture.md`
- `docs/current-work.md`
- `docs/refactor-roadmap.md`
- `docs/decisions.md`

It also gives you commands for:

- initializing those docs
- refreshing factual repo snapshots
- generating a session summary
- validating stale or missing memory
- starting and finishing an AI handoff cleanly

## First Run

1. Open a real repository folder in VS Code.
2. Open the `Codex` sidebar in the activity bar.
3. Click `Initialize Project Memory`.
4. Open the generated docs and add any durable notes that only a human or teammate would know.
5. Run `Start Session From Project Memory` before a fresh AI conversation.

## Recommended Daily Workflow

1. Start a new AI thread.
2. Run `Start Session From Project Memory`.
3. Do the work.
4. Run `Generate Session Summary` if you want a quick handoff draft.
5. Run `Update Memory Docs Now` when you want fresh repo facts.
6. Run `Finish Session And Update Project Memory` near the end of the session.

## What To Put In The Docs

Good durable notes include:

- architecture intent
- unfinished work that is intentional
- tradeoffs and constraints
- risks and open questions
- decisions that future sessions should not have to rediscover

Less useful notes include:

- temporary debugging noise
- full transcripts
- every tiny code change
- facts the extension can already infer automatically

## Tips

- Keep the docs short and clear. They should help the next session orient fast.
- Treat `current-work` as the handoff doc and `decisions` as the “why did we choose this?” doc.
- Use validation when the repo has changed a lot and you want a quick drift check.
- Use the suggested commit message as a convenience, not a rule.

## If You Only Remember One Thing

The goal is not “document everything.”

The goal is to preserve the few pieces of context that would be painful to reconstruct from code alone.
