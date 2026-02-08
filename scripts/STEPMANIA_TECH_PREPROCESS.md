# StepMania Tech Preprocessing

This repo now generates chart tech counts at build time from local simfiles.

## Default Extractor

`prepare:data` runs:

- `node scripts/extract-stepmania-tech-counts.mjs`

It parses every chart via `parseSm()`, computes:

- ITGmania-style StepParity tech categories via `scripts/itgmania-tech-counts.mjs`
- extended non-StepMania metrics via `computeChartMetrics()`

and exports:

- `data/generated/stepmania-tech-counts.json`

Output keys include basic counts, ITGmania tech counts, and advanced pattern counts, including:

- `steps`, `notes`, `jumps`, `hands`, `quads`, `holds`, `shocks`
- `crossovers`, `halfCrossovers`, `fullCrossovers`, `holdCrossovers`
- `footswitches`, `upFootswitches`, `downFootswitches`, `sideswitches`
- `jacks`, `brackets`, `doublesteps`
- `anchors`, `spins180`, `spins360`, `staircases`, `rolls`, `candles`, `drills`, `gallops`, `monoRuns`, `streams`, `bursts`

Compatibility aliases are also written:

- `TechCountsCategory_Crossovers`
- `TechCountsCategory_Footswitches`
- `TechCountsCategory_Sideswitches`
- `TechCountsCategory_Jacks`
- `TechCountsCategory_Brackets`
- `TechCountsCategory_Doublesteps`

## Merge Into Song Metadata

`generate-song-meta.mjs` reads `data/generated/stepmania-tech-counts.json` and merges matched counts into:

- `difficulty.stepmaniaTech`

Matching is done by:

- `chartId` first
- fallback `path|mode|difficulty`

## Optional External Import

If you have an external exporter, `scripts/import-stepmania-tech-counts.mjs` is still available to normalize foreign JSON into the same generated file format.
