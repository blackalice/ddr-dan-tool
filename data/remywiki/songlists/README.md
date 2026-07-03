# RemyWiki songlist snapshots

Place saved RemyWiki arcade songlist pages in this directory as `.html` or `.htm`
files. `scripts/generate-ddr-version-overrides.mjs` matches files by release name
and parses full playable song lists into `data/ddr-ver/*-full.json`.

If no snapshots are present, the generator falls back to cumulative local
`song-meta.json` data so the app has deterministic baseline override files.
