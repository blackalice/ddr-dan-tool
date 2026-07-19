# Repository Guidelines

## Project Structure & Module Organization
Source lives in `src/` with React function components, utilities, and auth helpers. Preprocessing scripts are in `scripts/`, static assets sit in `public/`, and the Cloudflare Worker entry point is `_worker.js`. Config files such as `vite.config.js` and `wrangler.jsonc` stay at the repo root. Build artifacts are generated into `dist/` and remain untracked.

## Build, Test, and Development Commands
Use `npm ci` for deterministic installs. Use `npm run dev` to start Vite and Wrangler together for local development. Run `npm run build` for the frontend bundle only, `npm run data:prepare` for incremental generated-data updates, and `npm run build:full` when both are required. Use `npm run data:validate` to report stale generated files without rewriting them. Check the bundle locally with `npm run preview`. Lint the codebase with `npm run lint` before committing.

## Coding Style & Naming Conventions
Write modern ESM with React hooks and function components; keep JSX files under `src/`. Indent with two spaces and favor named exports. Components follow `PascalCase.jsx`, utilities use `camelCase.js`, and feature styles mirror the component name. ESLint is configured with React and hooks rules, so resolve all reported warnings before pushing.

## Performance & Data Access Notes
- Use the helpers exposed from `useScores()` when you need song metadata or aggregated stats. The context now provides `loadChartMeta()` and `ensureStats()`; call them instead of fetching `/song-meta.json` or recomputing stats on mount.
- Metadata is loaded lazily. Only trigger `loadChartMeta()` when a feature (Rankings, score migration, etc.) actually requires it, and let the shared cache handle reuse.
- Stats aggregation runs on demand. `ensureStats()` should be invoked from views that display stats (e.g. `StatsPage`) rather than inside providers or generic components.
- When persisting scores locally, write to `ddrScores` only—avoid creating additional `localStorage` keys so large uploads do not block the UI twice.

## Song Identity, Overrides, and Scores
- Treat the normalized simfile path, such as `sm/X2/Melody Life/Melody Life.sm`, as the canonical `songKey`. A chart identity is the `songKey` plus mode and difficulty (`chartKey`). Never use title, punctuation, artist, transliteration, or folder display text as the authoritative identity.
- Override files in `data/ddr-ver/` must use explicit `path`/`songKey` entries. Title-only or title-plus-artist entries are legacy compatibility only and must fail closed when they resolve ambiguously.
- Run `npm run data:validate` after changing simfiles, packs, generated data, or override lists. It verifies unique simfile/chart identities, override paths, and referenced difficulties.
- Adding a pack or building on another machine must not change existing canonical identities. Keep `data/song-ids.json` committed because its numeric IDs remain legacy aliases for old scores; do not use those numeric IDs as the new source of truth.
- Treat a simfile move or rename as an explicit identity migration. Do not silently remap it by matching title or artist. Use `scripts/migrate-score-keys.mjs` with the old ID map when migrating old numeric score keys.
- If chart contents change while the path remains the same, the identity remains the same; introduce an explicit migration/version decision before changing score semantics.
- When adding or changing filtering behavior, pass `path`/`songKey` and, for chart-level filtering, mode/difficulty through the shared override matcher. Do not reintroduce independent title-based matching in BPM, Rankings, Stats, Card Draw, Lists, Courses, or related views.

## Testing Guidelines
There is no broad automated test suite yet. For identity or override changes, also run `npm run test:identity` and `npm run data:validate`. Validate changes by running `npm run lint` and `npm run build`, then smoke test via `npm run dev` or `npm run preview`. When adding helpers in `utils/` or `auth/`, prefer small, testable functions and document manual verification steps in the PR description.

## Commit & Pull Request Guidelines
Commits follow Conventional Commits (e.g., `feat: add rankings filter`, `fix: handle DP parsing`) with subjects kept to 50 characters or fewer. Pull requests should summarise the change, link the related issue, include UI screenshots when relevant, and report the results of `npm run lint` and `npm run build`. Call out any impacts to data preprocessing scripts or additional manual steps required.

## Security & Configuration Tips
Store secrets in `.dev.vars`; never commit credentials. Wrangler bindings, such as D1 databases, are managed through `wrangler.jsonc`. Avoid adding large artifacts to version control; use `_archive/` for big assets if needed.
