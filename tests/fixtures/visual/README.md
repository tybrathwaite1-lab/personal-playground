# Visual test fixtures

Synthetic data for `scripts/visual/run.ts` (screenshot and accessibility checks). Nothing here is real or personal:
event titles start with "Sample", venues and addresses are invented, and every URL is `example.org`.

- `pulse.json`: a small Local Pulse file (shape of `src/types/pulse.ts`) for the frozen test time, Sat 2026-11-21 3 PM New York.
- `weather.json`: an Open-Meteo-shaped response.

The Weekly Drop uses the real, public `dist/data/drop.json` built from `content/drop/` at the same commit.
