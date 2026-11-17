/**
 * Weather via Open-Meteo (https://open-meteo.com) — free, no API key, no account.
 * Only an approximate location is sent (St. Petersburg by default, or your device's
 * location rounded to ~1 km if you opt in under Backup & Settings).
 */
import type { Experience } from '../types';

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

export const DEFAULT_LOCATION: GeoPoint = { lat: 27.77, lon: -82.64, label: 'St. Petersburg' };

export type WeatherVerdict = 'nice' | 'hot' | 'wet' | 'stormy' | 'cool';

export interface WeatherSnapshot {
  fetchedAt: number;
  lat: number;
  lon: number;
  label: string;
  tempF: number;
  code: number;
  highF: number;
  lowF: number;
  rainChance: number;
  sunset?: string;
  verdict: WeatherVerdict;
}

const CACHE_KEY = 'personal-playground:weather';
const MAX_AGE = 60 * 60 * 1000;

export function describeCode(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Mixed';
}

export function classify(code: number, highF: number, rainChance: number): WeatherVerdict {
  if (code >= 95) return 'stormy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || rainChance >= 60) return 'wet';
  if (highF >= 92) return 'hot';
  if (highF < 58) return 'cool';
  return 'nice';
}

export const VERDICT_COPY: Record<WeatherVerdict, string> = {
  nice: 'A good day to be outside.',
  hot: 'Hot one — outdoors early or after sunset.',
  wet: 'Wet out there. Indoor ideas get the nod.',
  stormy: 'Storms around. Stay in or go somewhere with a roof.',
  cool: 'Cool for Florida. Bring a layer.',
};

/** Weather that makes outdoor-only plans a poor bet. */
export function isIndoorDay(w: WeatherSnapshot | null): boolean {
  return Boolean(w && (w.verdict === 'wet' || w.verdict === 'stormy'));
}

export function isOutdoorOnly(e: Experience): boolean {
  return e.environments.length > 0 && e.environments.every((env) => env === 'outdoors');
}

function readCache(): WeatherSnapshot | null {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    return s ? (JSON.parse(s) as WeatherSnapshot) : null;
  } catch {
    return null;
  }
}

export function cachedWeather(loc: GeoPoint): WeatherSnapshot | null {
  const c = readCache();
  if (!c) return null;
  const sameSpot = Math.abs(c.lat - loc.lat) < 0.05 && Math.abs(c.lon - loc.lon) < 0.05;
  return sameSpot ? c : null;
}

export function isFresh(w: WeatherSnapshot | null): boolean {
  return Boolean(w && Date.now() - w.fetchedAt < MAX_AGE);
}

interface OpenMeteoResponse {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
    sunset?: string[];
  };
}

export async function fetchWeather(loc: GeoPoint, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: loc.lat.toFixed(2),
    longitude: loc.lon.toFixed(2),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset',
    temperature_unit: 'fahrenheit',
    timezone: 'auto',
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!res.ok) throw new Error(`Weather unavailable (${res.status})`);
  const j = (await res.json()) as OpenMeteoResponse;
  const code = j.current?.weather_code ?? j.daily?.weather_code?.[0] ?? 0;
  const highF = Math.round(j.daily?.temperature_2m_max?.[0] ?? j.current?.temperature_2m ?? 75);
  const lowF = Math.round(j.daily?.temperature_2m_min?.[0] ?? highF);
  const rainChance = j.daily?.precipitation_probability_max?.[0] ?? 0;
  const snap: WeatherSnapshot = {
    fetchedAt: Date.now(),
    lat: loc.lat,
    lon: loc.lon,
    label: loc.label,
    tempF: Math.round(j.current?.temperature_2m ?? highF),
    code,
    highF,
    lowF,
    rainChance,
    sunset: j.daily?.sunset?.[0],
    verdict: classify(code, highF, rainChance),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
  return snap;
}
