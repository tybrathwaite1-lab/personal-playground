import { useEffect, useState } from 'react';

/**
 * Tiny hash router. Hash URLs (#/local) work on GitHub Pages without any
 * 404 redirect tricks and keep offline navigation simple.
 */
export type RouteName =
  | 'home'
  | 'discover'
  | 'plan'
  | 'pulse'
  | 'drop'
  | 'interests'
  | 'local'
  | 'digital'
  | 'rediscover'
  | 'collection'
  | 'notes'
  | 'backup';

export const ROUTES: RouteName[] = [
  'home',
  'discover',
  'plan',
  'pulse',
  'drop',
  'interests',
  'local',
  'digital',
  'rediscover',
  'collection',
  'notes',
  'backup',
];

/**
 * Hidden review routes: reachable only by typing the URL, never linked from navigation,
 * never part of ROUTES (so the app, its navigation and the standard screenshot matrix are
 * unchanged). Each one is code-split.
 */
export type PreviewName = 'styleguide' | 'preview/make-it-yours';
/** Hidden review routes: #/styleguide and the Creative Slice 02 prototype (#/preview/make-it-yours). */
export const PREVIEWS: PreviewName[] = ['styleguide', 'preview/make-it-yours'];

export interface Route {
  name: RouteName;
  /** Optional query, e.g. #/discover?exp=exp-analog-evening */
  params: URLSearchParams;
  /** A hidden review route (e.g. #/styleguide); `name` stays 'home' for everything else. */
  preview: PreviewName | null;
}

/**
 * Route hashes start with `#/` (or are empty). A bare fragment such as `#main` is an in-page
 * anchor (e.g. a skip link's default navigation), not a route, so it must not change the page.
 */
export function isRouteHash(hash: string): boolean {
  return hash === '' || hash === '#' || hash.startsWith('#/');
}

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query = ''] = clean.split('?');
  const preview = (PREVIEWS as string[]).includes(path) ? (path as PreviewName) : null;
  const name = (ROUTES as string[]).includes(path) ? (path as RouteName) : 'home';
  return { name, params: new URLSearchParams(query), preview };
}

export function href(name: RouteName, params?: Record<string, string>): string {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  return `#/${name === 'home' ? '' : name}${q}`;
}

export function navigate(name: RouteName, params?: Record<string, string>): void {
  window.location.hash = href(name, params);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      // In-page anchors keep the current route (and its scroll position).
      if (!isRouteHash(window.location.hash)) return;
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
