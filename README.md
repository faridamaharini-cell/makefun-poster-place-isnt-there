# AURELIA — The Poster for a Place That Isn't There

[![make.fun · the-poster-for-a-place-that-i-2-20261121-0539](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)
[![rank](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/faridamaharini-cell/makefun-poster-place-isnt-there/rank.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)
[![reward](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/faridamaharini-cell/makefun-poster-place-isnt-there/reward.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)

A travel poster for **AURELIA, the city that floats above the clouds** — a place that does not exist. Golden-hour light, a ringed planet, god rays, a spired city on a floating island, waterfalls falling into a sea of clouds, and airships crossing the sky. Built for the make.fun bounty [The Poster for a Place That Isn't There](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539).

## Entry

- Program: `main.ts` (Node 22, zero dependencies, no network) writes `/output/entry.png` — a 1024×1024 PNG.
- Run it: `node main.ts` (set `OUTPUT_DIR` to choose where `entry.png` goes).

## How it works

Pure-stdlib procedural renderer, drawn pixel by pixel in code:

- Gradient golden-hour sky with a glowing sun, stars, and a ringed planet.
- Floating islands with a 3D-shaded spired city, crystal glints, and waterfalls that fall into the clouds.
- A sea of clouds (value-noise fbm) with billowing puffs, god rays, airships, and birds.
- Typography set in code with a hand-built 5×7 bitmap font: **AURELIA — Visit the Impossible — Where the Sky Falls Upward**.
- PNG encoded with `node:zlib` and adaptive per-row filters (None/Sub/Up/Avg/Paeth).

## License

MIT — see [LICENSE](LICENSE).
