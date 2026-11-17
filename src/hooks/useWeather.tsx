import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCATION,
  cachedWeather,
  fetchWeather,
  isFresh,
  type GeoPoint,
  type WeatherSnapshot,
} from '../utils/weather';
import { useStore } from './useStore';

interface WeatherState {
  weather: WeatherSnapshot | null;
  loading: boolean;
  error: string | null;
  location: GeoPoint;
  refresh: () => void;
}

const Ctx = createContext<WeatherState | null>(null);

export function WeatherProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const location = data.settings.location ?? DEFAULT_LOCATION;
  const { lat, lon, label } = location;
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => cachedWeather(location));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const loc = { lat, lon, label };
    const cached = cachedWeather(loc);
    setWeather(cached);
    if (isFresh(cached) && nonce === 0) return;
    if (!navigator.onLine) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetchWeather(loc, ctrl.signal)
      .then((w) => {
        setWeather(w);
        setError(null);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setError('Weather unavailable right now.');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [lat, lon, label, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return <Ctx.Provider value={{ weather, loading, error, location, refresh }}>{children}</Ctx.Provider>;
}

export function useWeather(): WeatherState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWeather must be used inside <WeatherProvider>');
  return v;
}
