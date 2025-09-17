# Repository Guidelines

## Project Structure & Module Organization
Source lives in `src/` with React function components, utilities, and auth helpers. Preprocessing scripts are in `scripts/`, static assets sit in `public/`, and the Cloudflare Worker entry point is `_worker.js`. Config files such as `vite.config.js` and `wrangler.jsonc` stay at the repo root. Build artifacts are generated into `dist/` and remain untracked.

## Build, Test, and Development Commands
Use `npm run dev` to start Vite and Wrangler together for local development. Run `npm run build` to execute preprocessing scripts (`prebuild`) and produce the production bundle. Check the bundle locally with `npm run preview`. Lint the codebase with `npm run lint` to catch style or import issues before committing.

## Coding Style & Naming Conventions
Write modern ESM with React hooks and function components; keep JSX files under `src/`. Indent with two spaces and favor named exports. Components follow `PascalCase.jsx`, utilities use `camelCase.js`, and feature styles mirror the component name. ESLint is configured with React and hooks rules, so resolve all reported warnings before pushing.

## Testing Guidelines
There is no formal automated test suite yet. Validate changes by running `npm run lint` and `npm run build`, then smoke test via `npm run dev` or `npm run preview`. When adding helpers in `utils/` or `auth/`, prefer small, testable functions and document manual verification steps in the PR description.

## Commit & Pull Request Guidelines
Commits follow Conventional Commits (e.g., `feat: add rankings filter`, `fix: handle DP parsing`) with subjects kept to 50 characters or fewer. Pull requests should summarise the change, link the related issue, include UI screenshots when relevant, and report the results of `npm run lint` and `npm run build`. Call out any impacts to data preprocessing scripts or additional manual steps required.

## Security & Configuration Tips
Store secrets in `.dev.vars`; never commit credentials. Wrangler bindings, such as D1 databases, are managed through `wrangler.jsonc`. Avoid adding large artifacts to version control; use `_archive/` for big assets if needed.
