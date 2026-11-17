# PERSONAL<br>PLAYGROUND.

*Vol. 01 — Stay curious. Play more. Explore freely.*

A personal lifestyle discovery app: part independent culture magazine, part digital clubhouse, part discovery engine. It helps decide how to spend free time on purpose — explore interests, rediscover old hobbies, find good local experiences around St. Petersburg & Tampa Bay, and wander the good corners of the internet.

**No goals. No quotas. Just curiosity.** There are no streaks, scores, completion percentages or guilt-based notifications — by design.

---

## What's inside

| Section | What it does |
|---|---|
| **Home** | A magazine cover: today's question, a featured experience (changes daily), Surprise Me, a shuffleable rotation, eight curated "editions", and recently saved items. |
| **Discovery Engine** | Six optional filters (mood, company, time, budget, energy, environment). Genuinely random picks that don't repeat until every match has been shown. When nothing matches, it offers to loosen specific filters (and shows how many results each would open up) — it never silently drops one. Full searchable catalogue + add your own experiences. |
| **My Interests** | The interest directory in five categories. Add, rename, move between categories, remove. Each interest links to related experiences. The *Habit & Autopilot* section is hidden by default and ships empty (see Privacy). |
| **Local Playground** | 27 St. Pete / Tampa Bay entries with search and filters (category, neighborhood, budget, favorites), Google Maps directions, favorites, personal notes and verification status. Add your own places. |
| **Digital Playground** | Curated websites by category, random site button, favorites, edit/add/remove. |
| **Rediscover** | Old interests with gentle ways back in, nearby places, and a "good in the right setting" footnote. |
| **My Collection** | Everything you've saved (experiences, places, websites, interests, personal discoveries) with search, type filter, notes and removal. |
| **Field Notes** | A low-pressure notebook: title, category, notes, URL, tags, date. Never a daily journal. |
| **Backup & Settings** | JSON export/import (merge or replace), privacy controls, iPhone install steps, erase data. |

## Tech stack

React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · Lucide icons · LocalStorage · a hand-written service worker for offline use. No backend, no API keys, no paid services. Fonts: Anton, IBM Plex Sans and IBM Plex Mono from Google Fonts (cached for offline after the first visit).

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serve the production build locally (the service worker only runs here and in production) |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys on every push to `main`.

1. Create a GitHub repository (e.g. `personal-playground`) and push this folder to its `main` branch:
   ```bash
   git remote add origin https://github.com/<you>/personal-playground.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Watch the **Actions** tab. When it finishes, the site is live at `https://<you>.github.io/<repo-name>/`.

**Base path.** The workflow sets `BASE_PATH=/<repo-name>/` automatically, so any repo name works. If you deploy to `<you>.github.io` itself or a custom domain, change `BASE_PATH` in the workflow to `/`.

Routing uses hash URLs (`#/local`), so deep links and refreshes work on GitHub Pages without a 404 workaround.

**Lockfile.** The first `npm install` creates `package-lock.json`. Commit it, then switch the workflow's install step to `npm ci` for reproducible builds.

## Install on iPhone (PWA)

1. Open the deployed URL in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Launch from the icon. It opens full-screen and works offline after the first visit.

Note: on iOS the home-screen app has **its own storage**, separate from Safari tabs. Use Backup → Export/Import to move data between them.

## Editing content

All content lives in `src/data/` as typed TypeScript — separate from the UI.

### Experiences — `src/data/experiences.ts`
Copy an entry and give it a unique `id`:
```ts
{
  id: 'exp-my-idea',
  name: 'My Idea',
  kicker: '遊び',                 // optional decorative Japanese/editorial kicker
  description: 'One or two sentences.',
  activities: ['Step one', 'Step two'],
  cost: { min: 0, max: 20 },      // USD per person; min 0 = can be free
  duration: { min: 60, max: 120 },// minutes
  energy: 'low',                  // low | medium | high
  moods: ['relax', 'create'],     // relax | create | explore | play | connect
  company: ['solo', 'partner'],   // solo | partner | friends
  environments: ['home'],         // home | outdoors | indoor | online
  interests: ['Drawing'],         // match names in interests.ts to link them
  placeIds: ['pl-weedon'],        // optional, from places.ts
  links: [{ label: 'Site', url: 'https://…' }],
}
```
How filters match: *time* matches when the duration range overlaps the chosen window; *budget* matches when the experience **can** be done within it (`cost.min ≤ budget`). Custom experiences can also be added from the app.

### Local destinations — `src/data/places.ts`
Each place has a `status`:
- `verified` — address/website checked against a published source on `verifiedOn` (with a `sourceNote`).
- `check` — real place, but a detail (street number, current status) needs confirming. Shown as "Confirm before visiting".
- `placeholder` — a slot for you to fill in; no business is claimed.

Never add hours, prices or events you haven't confirmed. Directions links are generated from name + address — no map API needed.

### Digital resources — `src/data/websites.ts`
Add `{ id, name, url, category, description, tags }`. Categories: Music, Art and design, Internet exploration, Gaming, History, Technology, DIY, Cultural discoveries.

### Curated editions — `src/data/curated.ts`
Each edition lists `experienceIds` from the experience database.

## Your data: import & export

Personal data (saves, notes, favorites, custom entries, interest edits) is stored in LocalStorage under `personal-playground:v1`.

- **Export:** Backup & Settings → *Export backup* downloads `personal-playground-backup-YYYY-MM-DD.json`.
- **Import:** choose a backup, then *Merge with current* (union by id, imported wins) or *Replace everything*.

Backup filenames are in `.gitignore` so they don't get committed by accident.

## LocalStorage limitations

- Data lives in one browser on one device. No sync between devices.
- Clearing site data, Safari's "Clear History and Website Data", or private browsing will lose it. iOS Safari may also evict storage for sites not used in a long time; installed home-screen apps are treated more generously, but **export a backup now and then**.
- Roughly 5 MB per site — far more than this app needs.
- If storage is blocked (private mode), the app shows a warning banner.

## Privacy

- No accounts, analytics, trackers or server. Nothing leaves your browser unless you export it.
- The only third-party request is Google Fonts.
- The repository is meant to be public, so the seed data contains **no sensitive personal information**. The *Habit & Autopilot* list ships empty and hidden; anything you add stays on your device and in your own backups.
- Keep exported backups somewhere private.

## Project structure

```
src/
  components/   Layout, cards, forms, shared UI
  pages/        One file per section
  data/         Experiences, interests, places, websites, curated editions
  hooks/        useStore (state + persistence), useRoute (hash router)
  types/        Shared TypeScript types
  utils/        Discovery engine, storage/backup, labels, helpers
  styles/       Tailwind entry + grain, components
public/
  icons/        App icons
  manifest.webmanifest
  sw.js         Service worker (offline)
.github/workflows/deploy.yml
```

## Ideas for later

- Optional sync (e.g. a private GitHub Gist or iCloud file) so phone and laptop share data.
- "Plan a day" mode that strings 2–3 experiences and nearby places together.
- Weather-aware suggestions (outdoor picks on nice days).
- An OpenStreetMap view for the Local Playground.
- A small, hand-picked events calendar maintained by you.
- Self-hosted fonts for a fully offline first launch.
