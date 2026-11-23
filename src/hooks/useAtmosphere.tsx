import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ATMOSPHERE_KEY, isChoice, loadAtmosphereChoice, resolveAtmosphere, saveAtmosphereChoice, type Atmosphere, type AtmosphereChoice } from '../utils/atmosphere';

interface AtmosphereState {
  choice: AtmosphereChoice;
  /** The atmosphere in effect now. */
  atmosphere: Atmosphere;
  choose: (c: AtmosphereChoice) => void;
}

const Ctx = createContext<AtmosphereState | null>(null);

/**
 * Provides the atmosphere and mirrors it onto <html data-atmosphere>. In Auto it re-checks the
 * clock every minute, so crossing 6 am, 11 am or 6 pm changes the look without a reload.
 */
export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<AtmosphereChoice>(loadAtmosphereChoice);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (choice !== 'auto') return;
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [choice]);

  // Another tab changed the choice.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ATMOSPHERE_KEY || e.key === null) setChoice(isChoice(e.newValue) ? e.newValue : 'auto');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const atmosphere = resolveAtmosphere(choice, now);
  useEffect(() => {
    document.documentElement.dataset.atmosphere = atmosphere;
  }, [atmosphere]);

  const choose = useCallback((c: AtmosphereChoice) => {
    saveAtmosphereChoice(c);
    setChoice(c);
    setNow(new Date());
  }, []);

  return <Ctx.Provider value={{ choice, atmosphere, choose }}>{children}</Ctx.Provider>;
}

export function useAtmosphere(): AtmosphereState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAtmosphere must be used inside <AtmosphereProvider>');
  return v;
}
