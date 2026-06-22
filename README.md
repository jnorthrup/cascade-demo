# Cascade Demo

A small Vite + React demo for exploring JSON mapreduce array keys with a sliding prefix length.

This version focuses on the core idea you called out:

- a single `[path, timestamp]` event can fan out into several emitted rows
- prefix depth controls how much of the ordered keyspace you inspect
- the demo shows raw rows and event fan-out directly, without a map/reduce layer

## What it shows

- a large synthetic keyspace of paths and timestamps
- events that emit multiple rows per `[path,timestamp]`
- prefix range selection using `startkey` / `endkey`-style semantics
- raw rows grouped by prefix, plus event fan-out detail

## Running locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The production build is written to `docs/` for GitHub Pages.

## Demo controls

- Path: choose the path prefix
- Event: choose the specific timestamped event
- Prefix depth: choose how much of the key you expose
- Metric: choose which metric row to inspect
- View: switch between raw rows and event fan-out

## Key idea

The keyspace is ordered so prefix slices are contiguous. That means you can inspect a narrow leaf-like slice or a broader path/timestamp prefix slice from the same data.

The important thing is not a fabricated column rollup. The important thing is the raw emitted rows and the range of keys they occupy.

## Deployment

GitHub Pages serves the built site from `docs/`.

If you rebuild locally, the `postbuild` script recreates `docs/.nojekyll` automatically.
