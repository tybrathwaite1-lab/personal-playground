# PP-005 — integration diligence and handoff

2026-11-17 | Refs #6 | Follow-up to merged PP-005-local-sources.md.

## Verdict
Ten candidates reviewed; zero cleared for activation. Web text retrieval is not a raw HTTP/ICS test. Four candidate feed URLs were attempted and all returned tool-inaccessible results, not verified origin HTTP failures. No VCALENDAR bytes, parser run, publisher authorization or redistribution grant obtained. No publisher contacted. Costs and rate limits unknown. Existing ingestion only supports ICS (src/data/pulseSources.ts). Do not enable speculative endpoints.

| Candidate | Evidence checked 2026-11-17 | Feed / permission disposition | Next action |
|---|---|---|---|
| Pier | https://stpetepier.org/events/list/ returned forbidden in retrieval | Candidate https://stpetepier.org/events/list/?ical=1 inaccessible; permission unknown | Confirm publisher export and ordinary network access; no bypass |
| Studio at 620 | https://thestudioat620.org/events/ shows ten listings and list/month/day navigation; no Subscribe text found | Candidate https://thestudioat620.org/events/list/?ical=1 inaccessible; permission unknown | Ask publisher for rolling feed and factual reuse |
| Factory | https://thefactoryofstpete.com/events/ and /events/list/ show 12 upcoming listings; replaces prior archive lead | Candidate https://thefactoryofstpete.com/events/list/?ical=1 inaccessible; permission unknown | First pilot candidate; ask via official site contact, verify recurring IDs and cross-campus duplicates |
| AMRoC | https://amroctampabay.com/calendar/ explicitly embeds public Google Calendar, including a US holidays calendar; footer forbids reuse of site content without permission | Standard public ICS URL derived from embedded calendar ID tested but inaccessible through retrieval; not a publisher-advertised endpoint; permission required | Request authorized ICS URL and permission; exclude unrelated holiday calendar |
| New World | https://www.newworldtampa.com/events HTML listings; Melee recurrence label weekly conflicts with biweekly prose | No verified feed or reuse grant | Ask for export; manually confirm individual dates |
| Bayboro | https://bayborobrewing.com/live/events.php HTML listings; page says Feed Calendar but no verified machine feed; free/TBD/ticket and closure records | No verified feed or reuse grant | Ask for supported export; never classify closures as events |
| Morean | https://moreanartscenter.org/calendar/ dated HTML entries and external registration links | No verified feed or reuse grant | Manual discovery; request export if useful |
| Tombolo | https://www.tombolobooks.com/events-book-clubs/events returns JS-required shell in retrieval | No verified feed or reuse grant | Manual browser verification; ask for supported feed, no reverse-engineering |
| Jannus | https://jannuslive.com/shows/calendar/ dated HTML calendar; no iCal text found; includes offsite and sold-out shows | No verified feed or reuse grant | Request feed; retain venue and availability distinctions |
| Tampa Theatre | https://tampatheatre.org/?show_type=movie HTML film schedule | No verified feed or reuse grant | Request schedule export; preserve separate screenings |

Permission review is partial: AMRoC explicit restriction found; for the other nine no affirmative authorization established, and comprehensive terms/robots review remains outstanding. Public availability is not authorization. Do not infer prohibition simply from absence of a grant.

## Engineering handoff (proposed, after existing Sprint 01 fixes)
1. Prioritize Factory, Studio and Pier for publisher inquiry; AMRoC next if permission obtained. Research lead or owner should obtain affirmative terms for periodic retrieval and public display of factual event metadata, attribution, frequency and fees. No outbound messages sent by this PR.
2. After publisher confirms endpoint, run ordinary unauthenticated GET from GitHub Actions or authorized developer environment with timeout, limited redirects, identifiable agent and no credentials. Record status, final URL, content type, bytes, VCALENDAR/VEVENT counts and check date. No bypass of access restrictions, no guessed endpoint activation. Use conditional requests where supported and approved. Do not log raw personal contact or event attendee data.
3. Test current parseIcs/normalization pipeline with sanitized synthetic fixtures: distinct recurring occurrences, Eastern DST, all-day and multi-day events, cancellation, offsite venue, unknown price, duplicate ArtWalk/FloridaRAMA, empty/malformed response and stale fallback. PP-001/002/007 dependencies; if recurrence cannot be supported safely, keep source disabled. Compare a small sample against official calendar.
4. Only after permission and technical acceptance add one source with stable id to pulseSources.ts, document evidence and limits, run npm test and npm run build, submit isolated PR for review. No change to existing feeds in this research work.
5. Parallel alternative: owner-approved reviewed manual event JSON input (separate from generated output) with factual fields only: stable id, title, start/end with offset, venue, official URL, admission status, source and checked date; validate and expire automatically. No invented or copied descriptions, no unreviewed publication. Design only until owner approves. Start with New World, Bayboro, Factory and Morean after verifying individual events. Preserve current directory/community functionality.

## Acceptance and blockers
Source-level triage complete; raw feed tests and permissions blocked/not obtained. Keep issue #6 open. No app tests executed, no runtime changes, no private data access. No STATUS/HANDOFF edits to avoid parallel engineering conflicts. This report supersedes earlier tentative technical classification only, not the broader source inventory. Optional future lead outside the ten: University of Tampa public Trumba calendar advertises RSS/XML/iCal at https://www.trumba.com/events-calendar/fl/tampa/ut-events/tampa-events/ut-events-theatre-and-dance ; permission and payload unverified. Do not expand current scope automatically.
