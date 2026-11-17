/**
 * Feeds the candidate-discovery step reads. Each is a public RSS/Atom feed the
 * publisher provides for syndication. Candidates are research leads only — they are
 * shown unreviewed on the Editorial desk and never auto-published.
 */
export interface CandidateFeed {
  id: string;
  name: string;
  url: string;
  column: string;
}

export const CANDIDATE_FEEDS: CandidateFeed[] = [
  { id: 'bandcamp-daily', name: 'Bandcamp Daily', url: 'https://daily.bandcamp.com/feed', column: 'listen' },
  { id: 'hackaday', name: 'Hackaday', url: 'https://hackaday.com/feed/', column: 'lab' },
  { id: 'vghf', name: 'Video Game History Foundation', url: 'https://gamehistory.org/feed/', column: 'select-player' },
  { id: 'public-domain-review', name: 'The Public Domain Review', url: 'https://publicdomainreview.org/rss.xml', column: 'archive' },
  { id: 'ann', name: 'Anime News Network', url: 'https://www.animenewsnetwork.com/all/rss.xml', column: 'screen' },
  { id: 'juxtapoz', name: 'Juxtapoz', url: 'https://www.juxtapoz.com/news/?format=feed&type=rss', column: 'blackbook' },
];
