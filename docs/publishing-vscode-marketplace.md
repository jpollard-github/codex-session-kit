# Publishing To The VS Code Marketplace

This guide is for publishing `Codex Session Kit` to the Microsoft VS Code Extension Marketplace after you create the real GitHub repo and Marketplace publisher.

## What To Change Before First Publish

Update [package.json](/Users/jasonp/repos/codex-session-kit/package.json) first:

- Replace `"publisher": "local-dev"` with your real Marketplace publisher id
- Add a `repository` field that points to the public GitHub repo
- Add a `homepage` field for the repo or project page

Example:

```json
{
  "publisher": "your-publisher-id",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-name/codex-session-kit.git"
  },
  "homepage": "https://github.com/your-name/codex-session-kit"
}
```

Why that matters:

- Marketplace publishing requires a real `publisher`
- This repo's `README.md` contains a relative image path, and `vsce` rewrites those cleanly when `repository` points to a public GitHub repo

## Included Assets

This repo already includes Marketplace-friendly assets:

- `media/codex-session-kit.png`
  - Used as the extension icon in `package.json`
- `media/codex-session-kit.webp`
  - Used in `README.md` as a preview image

## Local Publish Helper Scripts

From the repo root:

```bash
npm install
```

Available scripts:

- `npm run publish:check`
  - Runs Marketplace preflight checks
- `npm run publish:vsix`
  - Runs preflight, syntax checks, then packages the `.vsix`
- `npm run publish:marketplace`
  - Runs preflight, syntax checks, then runs `vsce publish`

You can still use the lower-level commands directly:

```bash
npm run lint:extension
npm run package:vsix
npx vsce publish
```

## What The Preflight Script Checks

The helper script at [scripts/publish-preflight.js](/Users/jasonp/repos/codex-session-kit/scripts/publish-preflight.js) currently checks for:

- placeholder `publisher` values like `local-dev`
- missing or invalid icon paths
- SVG extension icon usage
- missing `repository` or `homepage`
- missing root `LICENSE` or `CHANGELOG.md`
- insecure README image URLs
- relative README images without a public GitHub repository configured

## First Manual Publish

The simplest path for an initial manual publish is still `vsce publish`.

High-level steps:

1. Create your Marketplace publisher
2. Update `package.json` with the real publisher id
3. Push the repo to public GitHub
4. Run `npm install`
5. Run `npm run publish:check`
6. Run `npm run publish:marketplace`

If you want `vsce` to bump the version while publishing, you can pass a SemVer increment:

```bash
npm run publish:marketplace -- patch
```

You can also use `minor` or `major`.

## Authentication Notes

The official VS Code publishing docs currently say:

- `vsce publish` is the standard command
- Personal Access Token based publishing is being retired for global PATs on **December 1, 2026**
- Microsoft recommends Microsoft Entra ID based automated publishing for longer-term CI/CD workflows

For a first manual publish, the official docs still describe PAT-based setup, but for longer-term automation you should plan around the newer Entra ID flow.

## Recommended Follow-Up Files

Marketplace pages usually look better when these exist at the repo root:

- `LICENSE`
- `CHANGELOG.md`
- `SUPPORT.md`

This repo does not currently include all of those files yet.

## References

- VS Code publishing docs: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- VS Code manifest docs: https://code.visualstudio.com/api/references/extension-manifest
