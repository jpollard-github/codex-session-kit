# Current Work

## Active Work
- Repositioning the extension around handoff quality instead of multi-doc auto-generated memory.
- Updating initialization so new repos get honest starter docs plus one generated snapshot.
- Converting the update flow into a review step that suggests what the human docs should say next.
- Improving session handoffs so they capture what changed, why, what to preserve, and what to do next.

## Next Best Task
- Test the new commands in an Extension Development Host against a real repo.
- Decide whether the review flow should eventually support a guided README update, not just a recommendation.
- Add automated coverage around doc initialization, snapshot refresh, and handoff-generation heuristics.

## Risks Or Watchouts
- `src/extension.js` is still carrying most of the workflow logic.
- Validation and README-review heuristics can still produce false positives.
- The repo still contains older docs from the previous model, so local testing should focus on the new tracked docs in `.vscode/ai-context.json`.
