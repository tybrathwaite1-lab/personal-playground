/**
 * Verified Local Pulse sources. Every feed here is a public calendar export the
 * publisher offers for subscribing (iCalendar). Checked 2026-11-17.
 *
 * To add a source: confirm the site offers a public .ics / "Export events" /
 * "Subscribe" link, then add an entry. The ingest script tolerates failures —
 * a broken feed never breaks the app.
 */
export interface PulseSourceDef {
  id: string;
  name: string;
  homepage: string;
  feed: string;
  kind: 'ics';
  /** What it covers — shown in the source inventory. */
  covers: string;
  /** Unverified feeds are tried, and simply report failure if unavailable. */
  verified: boolean;
}

export const PULSE_SOURCES: PulseSourceDef[] = [
  {
    id: 'spaa',
    name: 'St. Petersburg Arts Alliance',
    homepage: 'https://stpeteartsalliance.org/events/',
    feed: 'https://stpeteartsalliance.org/events/list/?ical=1',
    kind: 'ics',
    covers: 'Citywide arts calendar: exhibitions, theater, music, ArtWalk venues',
    verified: true,
  },
  {
    id: 'mfa',
    name: 'Museum of Fine Arts, St. Petersburg',
    homepage: 'https://mfastpete.org/events-calendar/',
    feed: 'https://mfastpete.org/events-calendar/photo/?ical=1',
    kind: 'ics',
    covers: 'Talks, tours, workshops and exhibition events at the MFA',
    verified: true,
  },
  {
    id: 'tbhc',
    name: 'Tampa Bay History Center',
    homepage: 'https://tampabayhistorycenter.org/events/',
    feed: 'https://tampabayhistorycenter.org/events/?ical=1',
    kind: 'ics',
    covers: 'History talks, book clubs, tours and walking tours',
    verified: true,
  },
  {
    id: 'tma',
    name: 'Tampa Museum of Art',
    homepage: 'https://tampamuseum.org/events/',
    feed: 'https://tampamuseum.org/?ical=1&eventDisplay=list',
    kind: 'ics',
    covers: 'Gallery chats, openings and events at the Tampa Museum of Art',
    verified: true,
  },
  {
    id: 'lowry',
    name: 'Lowry Parcade & Tavern',
    homepage: 'https://lowryparcade.com/events/',
    feed: 'https://lowryparcade.com/events/list/?ical=1',
    kind: 'ics',
    covers: 'Tampa Gaming Dojo FGC tournaments, casuals and arcade events',
    verified: true,
  },
  {
    id: 'hackerspace',
    name: 'Tampa Hackerspace (Meetup)',
    homepage: 'https://www.meetup.com/tampa-hackerspace/',
    feed: 'https://www.meetup.com/tampa-hackerspace/events/ical/',
    kind: 'ics',
    covers: 'Maker classes, open houses and workshops',
    verified: false,
  },
  {
    id: 'critical-hit',
    name: 'Critical Hit Games (Meetup)',
    homepage: 'https://www.meetup.com/critical-hit-games/',
    feed: 'https://www.meetup.com/critical-hit-games/events/ical/',
    kind: 'ics',
    covers: 'Tabletop and card game nights',
    verified: false,
  },
];
