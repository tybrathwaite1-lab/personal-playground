# PERSONAL<br>PLAYGROUND.

*Vol. 02 — Stay curious. Play more. Explore freely.*

A personal lifestyle discovery app: part independent culture magazine, part digital clubhouse, part discovery engine. It helps decide how to spend free time on purpose: what's happening around St. Petersburg & Tampa Bay this week, a small adventure for this afternoon, a vibe to follow tonight, and a Friday magazine of things worth exploring.

**No goals. No quotas. Just curiosity.** There are no streaks, scores, completion percentages or guilt-based notifications. That's by design.

Live: <https://tybrathwaite1-lab.github.io/personal-playground/>

---

## What's inside

| Section | What it does |
|---|---|
| **Home** | Masthead → *What sounds good?* → **Go somewhere / Do something / Discover something** → today around St. Pete → weather → **Pick a Vibe** → this week's **Drop** → a featured pick → recently saved. |
| **Local Pulse** (`#/pulse`) | Real listings pulled daily from official venue calendars. Views: Today, Tomorrow, This weekend, Next 7 days, Upcoming, Explore anytime (recurring communities + places). Filters: radius, budget (from stated prices only), time of day, indoor/outdoor, new/familiar, interest. Nine one-tap shortcuts, a surprise pick, source list with last-update time, stale/offline warnings. |
| **Plan an Outing** (`#/plan`) | **Mini-adventure**: pick company, time, budget per person, energy, radius, transport, atmosphere, weather and familiarity. You get a primary stop, an optional nearby second stop and a food stop, plus cost, travel, hours links and save. "Plan around this" from any event or place anchors it. **Day plan**: the original multi-stop itinerary. |
| **Discovery Engine** | Six optional filters, non-repeating random picks, honest "loosen this filter" suggestions, full catalogue, add your own, **save the current filters as a custom vibe**. Curated editions live here too. |
| **Pick a Vibe** | 12 presets (Lazy Sunday, Get Me Out, Date Afternoon, Nerd Mode, Creative Itch, The Rabbit Hole, Cheap Thrills, After Work, Analog Mode, Social but Chill, Nostalgia Trip, The Workshop) plus your own, synced. One tap gives you a pick, and *Fine-tune* opens the same filters in Discover. |
| **The Weekly Drop** (`#/drop`) | A Friday magazine with 11 columns. Each edition has an issue number, date, theme, intro, sources, related links, save, feedback and **Follow the thread**, plus an archive and an **Editorial desk** to import, validate and preview editions. |
| **Follow the Thread** | Typed links between items and topics, labeled *Documented* (fact) or *Our pick* (editorial). Shows the trail, never loops, max depth 6. |
| **Interests / Rediscover / Digital / Collection / Field Notes** | As in Vol. 01. Digital adds a 29-site cultural resource library that links back to Drop items citing it. |
| **Feedback** | Places: *Want to go / Been here / Enjoyed / Not for me*. Ideas and Drop items: *More like this / Already know it / Not my thing / Save*. Synced privately. Used only to mix familiar vs. new and to sink "not my thing", never as scores. |
| **Backup & Settings** | Sync, JSON export/import, weather location, home radius & transport, privacy, install steps, erase. |

## Tech stack

React 18 · TypeScript · Vite 5 · Tailwind 3 · Lucide · Leaflet + OpenStreetMap · LocalStorage · a service worker for offline use.

There's no backend, no API keys and no paid services. Build-time scripts run in GitHub Actions with `tsx`, and images are processed with `sharp`. Fonts are bundled.

## Architecture (Phase II)

```
GitHub Actions (push to main, manual run, daily 10:17 UTC)
 ├─ tests (node:test via tsx)
 ├─ images:     scripts/images/fetch.ts      → public/images/editorial/*.webp   (cached)
 ├─ candidates: scripts/drop/candidates.ts   → public/data/candidates.json      (leads only)
 ├─ pulse:      scripts/pulse/ingest.ts      → public/data/pulse.json           (falls back to last deploy)
 ├─ drop:       scripts/drop/build.ts        → public/data/drop.json            (validated)
 └─ vite build → GitHub Pages
Browser
 ├─ PulseProvider  fetches data/pulse.json   (cached; "stale" after 36h)
 ├─ DropProvider   fetches data/drop.json    (shows editions whose publishDate ≤ today, America/New_York)
 └─ Store + Sync   LocalStorage ⇄ your private GitHub data repo
```

`/data/*.json` is fetched network-first and falls back to the cached copy offline.

### Schema changes (all additive; old backups import cleanly)

- `PersonalData.feedback: Record<key, {familiar, liked, wantToGo, notInterested, moreLikeThis, at}>` with keys like `place:<id>`, `exp:<id>`, `event:<id>`, `drop:<itemId>`.
- `PersonalData.customPresets: VibePreset[]`
- `settings.radiusMiles` (default 10) and `settings.transport` (default car)
- Saved kinds add `event`, `community`, `drop`, `plan`.
- Sync merges `feedback:` and `customPresets` per entry with tombstones, like everything else.

## Local Pulse: verified source inventory

Pulled daily from official iCalendar feeds (no scraping and no API keys). Events keep their source link, and nothing is invented. Hours, prices and availability show only when the source states them.

| Source | Feed |
|---|---|
| St. Pete Arts Alliance | `stpeteartsalliance.org/events/list/?ical=1` |
| Museum of Fine Arts, St. Pete | `mfastpete.org/events-calendar/photo/?ical=1` |
| Tampa Bay History Center | `tampabayhistorycenter.org/events/?ical=1` |
| Tampa Museum of Art | `tampamuseum.org/?ical=1&eventDisplay=list` |
| Lowry Parcade | `lowryparcade.com/events/list/?ical=1` |
| Tampa Hackerspace (Meetup) | `meetup.com/tampa-hackerspace/events/ical/` |
| Critical Hit Games (Meetup) | `meetup.com/critical-hit-games/events/ical/` |

Sources live in `src/data/pulseSources.ts`. To add a feed, add an entry and its `ical` URL.

**Processing:**
- Times are converted to America/New_York.
- Events are deduplicated by title, start and venue.
- Ended events expire, cancelled ones are dropped, and listings that aren't events are filtered out (calls to artists, roundups, galas…).
- Tags come from keyword rules, and distance is city-level from St. Pete.
- If a feed fails, its previous events are kept, and the source list says so.

**Recurring communities** (`src/data/communities.ts`) are rules like "2nd Saturday 5–9 PM", taken from the organizer's own page. Each shows a verified or confirm status and a link.

### Refresh schedule

| What | When |
|---|---|
| Pulse events | Daily at 10:17 UTC (~6 AM ET), and on every deploy |
| Drop visibility | Each edition appears on its `publishDate` (the daily build also republishes) |
| Candidate leads | Daily, with the Pulse run |
| Places / communities | Manual. Each has a `verifiedOn` date |

## The Weekly Drop

Editions are JSON files in `content/drop/editions/`. They're validated at build time against `content/drop/edition.schema.json`, and the build fails on errors. Topic nodes for threads are in `content/drop/nodes.json`.

There are eight editions on a Friday cadence, all **already written**:

- No.1 *After Hours* (live at launch)
- No.2 *The Future That Never Was*
- No.3 *Anatomy of a Beat*
- No.4 *Before the Hype*
- No.5 *Worlds Drawn by Hand*
- No.6 *The Lost Internet*
- No.7 *Concrete & Culture*
- No.8 *Slow Frequencies* (Jan 1)

**To write or import an edition, see [EDITORIAL.md](EDITORIAL.md).** It covers the ChatGPT/assistant workflow, a copy-paste prompt, `content/drop/template.json`, how to preview in the app's Editorial desk, publishing from the GitHub website, corrections and scheduling.

```bash
npm run content   # strict validation of all editions
npm run links     # report dead source links (doesn't fail)
```

Candidate leads from RSS feeds (`src/data/candidateFeeds.ts`) show only in the Editorial desk as research starting points. They are **never auto-published**.

## Images

39 photos from **Wikimedia Commons** (CC0, public domain, CC BY, CC BY-SA), recorded in `src/data/images.ts` and credited in [IMAGE_CREDITS.md](IMAGE_CREDITS.md) and in every caption.

- **11 are real local places** (St. Pete Pier, the Dalí, Sunken Gardens, Weedon Island, Fort De Soto, Tampa Bay History Center, Plant Hall, the Riverwalk, Ybor, Dunedin). They're captioned *"Photo: <place>"* and are only ever used for that place, never as a generic stand-in.
- **28 are illustrative** mood photos (record crates, Kabukichō neon, arcade sticks, a Dreamcast, a tatami room…), captioned *"Illustrative photo"*.
- CI downloads each one once and makes 600/1200px WebP files, which are cached between runs. Images load lazily with fixed aspect ratios (no layout shift). If one is missing, a typographic placeholder shows.
- Local has a **Photos** toggle (off by default to keep the list fast).
- Finding more: the image scout (`scripts/images/scout.ts`) searches Commons and produces numbered contact sheets; see IMAGE_CREDITS.md.

## Run it locally

Requires Node 24 (`.nvmrc`; CI reads the same file, and `nvm use` picks it up) with its bundled npm 11. Dependencies are pinned by the committed `package-lock.json`. Dependency install scripts are blocked unless `package.json` → `allowScripts` approves them (`.npmrc`: `strict-allow-scripts=true`); none are approved today, because esbuild and sharp ship prebuilt binaries. No local toolchain? A GitHub Codespace on the branch works the same way (`nvm install` then the commands below).

```bash
npm ci             # exact versions from package-lock.json (use `npm install <pkg>` only to change dependencies)
npm run dev        # http://localhost:5173  (predev builds drop.json)
npm test           # every tests/**/*.test.ts; fails on skipped/focused/TODO tests or files that ran none
npm run pulse      # optional: pull live events into public/data/pulse.json
npm run images     # optional: fetch editorial photos
npm run build
```

## Deploy

`.github/workflows/deploy.yml` deploys `main` to GitHub Pages: on push, on manual run, and daily for fresh listings. `check.yml` runs tests, strict content validation, the link report and a full build on other branches. No secrets are required. Every workflow installs with `npm ci` from the lockfile and uses GitHub's own actions pinned to full commit SHAs listed in `.github/action-pins.json` (Node 24 runtime releases; `verify-action-pins.yml` checks each tag upstream). Workflow tokens are read-only by default; only the Pages deploy job and the two results publishers can write, and none of them runs npm code.

## Credentials & costs

| Item | Needed? | Where it lives |
|---|---|---|
| Sync token (fine-grained, one private repo, Contents R/W) | Optional | That browser's LocalStorage only |
| Anything else | No | — |

**Ongoing cost: $0.** This covers GitHub Pages, Actions minutes on a public repo, Open-Meteo (weather), OpenStreetMap tiles and public iCal feeds. Not implemented: start.gg tournament listings, which would need a (free) API token stored as an Actions secret.

## Sync between devices

Unchanged from Vol. 01. Data goes into `playground-data.json` in a **private** repo you own, merged per item, newest wins, with deletions remembered. Setup steps are in the app under **Backup & Settings → Sync**. The token never goes into exports or this repo, and the app refuses to sync to a public repository.

## Privacy

- This repo and site are public. Seed data contains no personal information, and the Habit & Autopilot list ships empty.
- Feedback, custom vibes, notes and saves stay on your device and in your private sync repo.
- Third-party requests: Open-Meteo (weather, coarse location you set), OpenStreetMap tiles (map view), and outbound links you tap. No analytics.

## Known limitations

- **Event fit is heuristic.** Who an event suits (solo, partner, friends), its energy level and indoor/outdoor are inferred from keywords, so check the source.
- **Distances are city-level**, not exact addresses.
- **Coverage is limited to the seven feeds above.** Many venues (bars, breweries, small galleries) don't publish iCal. Add feeds as you find them.
- **All photos are illustrative.** There are no licensed photos of actual local venues yet, and some topics (tea, skating) show a placeholder.
- **No AI runs in the app.** Edition writing is a manual or assistant-assisted workflow with validation (see EDITORIAL.md).
- **iOS home-screen apps keep separate storage** from browser tabs. Use sync or backup.
- **Launch timing:** Issue No.1 launched on a Tuesday. Later issues publish on Fridays.

## Project structure

```
content/drop/      editions/*.json, nodes.json, schema, template
scripts/           pulse/ingest.ts, drop/{build,candidates,check-links}.ts, images/fetch.ts
src/
  components/      Layout, cards, AdventurePanel, VibePicker, FeedbackBar, EditorialImage…
  pages/           One file per section (Pulse, Plan, Drop, …)
  data/            places, experiences, communities, pulseSources, vibes, images, websites…
  hooks/           useStore, useSync, useWeather, usePulse, useDrop, useRoute
  utils/           discovery, adventure, pulse, ics, geo, community, novelty, sync, dropValidate…
tests/             node:test suites + fixtures
```
