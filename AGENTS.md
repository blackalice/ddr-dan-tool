# Repository Guidelines

Use this guide when contributing to the project.

## Project Structure & Modules
- `src/`: React app (function components, ESM). Key entries: `main.jsx`, `App.jsx`, feature pages, `utils/`, `auth/`.
- `scripts/`: data prep utilities (`generate-processed-data.mjs`, `generate-song-meta.mjs`, `parse-ganymede-html.mjs`).
- `public/`: static assets served as-is.
- `_worker.js`: Cloudflare Worker using Hono; serves API routes and static assets.
- Config: `vite.config.js`, `wrangler.jsonc`. Build output in `dist/` (git-ignored).

## Build, Test, and Development
- `npm run dev`: local app + worker (concurrently runs Vite and Wrangler).
- `npm run build`: production build (runs preprocess scripts via `prebuild`).
- `npm run preview`: serve built app locally.
- `npm run lint`: ESLint over repo.
- `npm run deploy`: deploy via Wrangler.
- Data: scripts auto-run on `postinstall` and prebuild. Re-run manually if inputs change.

## Coding Style & Naming
- Language: modern ESM, React function components, JSX in `.jsx` files.
- Indentation: 2 spaces; prefer named exports.
- Linting: ESLint (`@eslint/js`, react-hooks, react-refresh). Rule highlight: `no-unused-vars` with pattern exceptions.
- Components: `PascalCase.jsx`; utilities: `camelCase.js`; CSS modules by feature file (e.g., `Feature.css`).

## Testing Guidelines
- No formal test suite today. Validate changes by running `npm run lint` and `npm run build`, then smoke test via `npm run preview` or `npm run dev`.
- When adding logic in `utils/` or `auth/`, include small, testable helpers and document manual steps in the PR.

## Commit & Pull Requests
- Commits: follow Conventional Commits (e.g., `feat: add rankings filter`, `fix: handle DP parsing`). Keep subject ≤ 50 chars.
- PRs: clear summary, linked issue, screenshots for UI changes, and results of `npm run lint` and `npm run build`. Note data script impacts.

## Security & Config
- Secrets: use `.dev.vars` for local development; never commit secrets. Wrangler binds (e.g., D1 DB) configured in `wrangler.jsonc`.
- Do not commit build artifacts (`dist/`). Large assets and archives belong in `_archive/` (already ignored).
