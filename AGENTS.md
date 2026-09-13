<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Approved design lock

The visual design is locked to Vercel deployment `dpl_9EZcZh48DNhzz7fsiC3LWFSaYX7L` (the photo-led Shooktoberfest 2026 homepage with the green/yellow editorial system).

- Treat the planning documents in `Website/` as functional and historical context only. Their design language is superseded by `design-lock.json`.
- Do not edit protected UI files, protected images, or the public section of `app/globals.css` unless Justin explicitly asks for a visual change.
- Admin-only CSS belongs after `/* Live event administration */` and must not override public selectors.
- Run `npm run design:check` before every build.
- Never deploy production directly from a dirty workspace. Create a forced preview with `npm run deploy:preview`, run `npm run deployment:check -- <preview-url>`, verify it in a browser, and only then promote that exact artifact.
- Never update `design-lock.json` merely to make a check pass. Rebaseline only after explicit visual approval.
