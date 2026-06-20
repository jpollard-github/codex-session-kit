# General Documentation

![Codex Session Kit](../media/codex-session-kit.webp)

## Philosophy

Codex Session Kit is built around a simple belief:

> AI works better when repos carry their own durable memory.

Most AI coding sessions are strong in the moment and weak across time. A model can help with a task right now, but the reasoning behind that task often disappears as soon as the thread is gone.

This extension exists to make that context survivable.

## The Problem It Solves

In longer-running repositories, a future AI session often does not know:

- what the project is really trying to do
- which architectural choices are deliberate
- what work is actively in progress
- which refactors are planned versus accidental
- what was decided and why

Code alone rarely answers those questions cleanly.

## The Approach

Instead of trying to automate everything, the extension splits project memory into two kinds of information:

1. Auto-generated factual snapshots
2. Human-maintained durable notes

Auto-generated content is good for:

- changed files
- git branch context
- repo structure
- recent activity
- package metadata

Human notes are better for:

- tradeoffs
- intent
- rationale
- priorities
- project-specific judgment

That split is the heart of the design.

## Why Clipboard Prompts?

The extension deliberately avoids provider-specific integrations in the MVP.

That means:

- you can use it with different AI tools
- the workflow stays portable
- the repo memory matters more than the chat vendor

The product value is the habit, not the API coupling.

## Why Validation Matters

Project memory is only useful if people trust it.

That is why the extension can warn about:

- missing docs
- stale docs
- malformed managed sections
- branch-switch drift
- placeholder-only content

Validation is heuristic, not magical. It is meant to catch likely drift early, not prove perfect truth.

## Why Branch Awareness Matters

One of the fastest ways for project memory to become misleading is switching branches.

`docs/current-work.md` may be accurate on one branch and wrong on another. The branch-aware warning is there to protect trust in the handoff layer, especially in larger repos.

## Why Session Summaries Matter

A good handoff is not a full transcript.

A good handoff is:

- what changed
- what matters
- what might need follow-up
- what the next session should not forget

The session-summary command tries to give you that shape quickly, while still leaving judgment in human hands.

## What Success Looks Like

The extension is doing its job when:

- you can reopen a repo weeks later and orient quickly
- a new AI thread does not need a long manual recap
- teammates can understand active work without guesswork
- durable docs stay small, current, and meaningful

## Design Principles

- Durable over clever
- Helpful over automatic
- Portable over provider-specific
- Context first, implementation second
- Human judgment stays in the loop

## Practical Advice

- Refresh docs when the repo changes materially.
- Write decisions when future-you would otherwise ask “why did we do this?”
- Keep `current-work` alive. It is often the highest-value handoff doc.
- Do not confuse a large amount of text with useful memory.

Clear, current, high-signal notes win.
