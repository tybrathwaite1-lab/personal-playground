import { useEffect, useState } from 'react';

/**
 * Tiny hash router. Hash URLs (#/local) work on GitHub Pages without any
 * 404 redirect tricks and keep offline navigation simple.
 */
export type RouteName =
  | 'home'
  | 'discover'
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
  'interests',
  'local',
  'digital',
  'rediscover',
  'collection',
  'notes',
  'backup',
];

export interface Route {
  name: RouteName;
  /** Optional query, e.g. #/discover?exp=exp-analog-evening */
  params: URLSearchParams;
}

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query = ''] = clean.split('?');
  const name = (ROUTES as string[]).includes(path) ? (path as RouteName) : 'home';
  return { name, params: new URLSearchParams(query) };
}

export function href(name: RouteName, params?: Record<string, string>): string {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  return `#/${name === 'home' ? '' : name}${q}`;
}

export function navigate(name: RouteName, params?: Record<string, string>): void {
  window.location.hash = href(name, params);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
