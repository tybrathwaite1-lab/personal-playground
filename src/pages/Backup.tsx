import { useRef, useState } from 'react';
import { Download, Eye, EyeOff, Smartphone, Trash2, Upload } from 'lucide-react';
import { SectionHeader } from '../components/ui';
import { SyncPanel } from '../components/SyncPanel';
import { useSync } from '../hooks/useSync';
import { useStore } from '../hooks/useStore';
import type { PersonalData } from '../types';
import { downloadBackup, parseBackup } from '../utils/storage';

export default function Backup() {
  const store = useStore();
  const sync = useSync();
  const { data } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PersonalData | null>(null);
  const [error, setError] = useState('');

  const size = new Blob([JSON.stringify(data)]).size;
  const summary = (d: PersonalData) =>
    [
      `${d.saved.length} saved`,
      `${d.fieldNotes.length} field notes`,
      `${d.favorites.length} favorites`,
      `${d.customExperiences.length + d.customPlaces.length + d.websites.length} custom entries`,
    ].join(' · ');

  const onFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    const result = parseBackup(await file.text());
    if (result.ok) setPending(result.data);
    else setError(result.error);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="max-w-3xl">
      <SectionHeader
        number="08"
        title="Backup & Settings"
        jp="保管"
        blurb="Your playground lives in this browser — and, if you turn on sync, in a private GitHub repo you own. Exports are still a good safety net."
      />

      <section className="card mb-6 p-5" aria-labelledby="sync-title">
        <p id="sync-title" className="label mb-2">
          Sync between devices
        </p>
        <SyncPanel />
      </section>

      <section className="card mb-6 p-5">
        <p className="label mb-1">On this device</p>
        <p className="text-paper/90">{summary(data)}</p>
        <p className="mt-1 font-mono text-xs text-muted">{(size / 1024).toFixed(1)} KB stored locally</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => downloadBackup(data)}>
            <Download size={16} aria-hidden /> Export backup (JSON)
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={16} aria-hidden /> Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a backup file"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
        {error && (
          <p className="mt-3 text-sm text-rust" role="alert">
            {error}
          </p>
        )}
        {pending && (
          <div className="mt-4 border border-rust/60 p-4" role="status">
            <p className="label mb-1 text-rust">Backup ready to import</p>
            <p className="text-sm">{summary(pending)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  store.mergeIn(pending);
                  setPending(null);
                  store.notify('Backup merged');
                }}
              >
                Merge with current
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (confirm('Replace everything on this device with the backup?')) {
                    store.replaceAll(pending);
                    setPending(null);
                    store.notify('Backup restored');
                  }
                }}
              >
                Replace everything
              </button>
              <button type="button" className="btn-ghost text-sm" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card mb-6 p-5">
        <p className="label mb-2">Privacy</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-paper/85">
          <li>No accounts, no analytics, no server. Nothing you save leaves this browser unless you export it.</li>
          <li>Weather (Open-Meteo) and map pins/tiles (OpenStreetMap) are free services that only receive a city-level location or public business addresses.</li>
          <li>Backups are plain JSON files — keep them somewhere private, not in the public repository.</li>
          <li>The optional habit & autopilot list is hidden by default and never part of the app’s public data.</li>
        </ul>
        <button
          type="button"
          className="btn mt-4"
          aria-pressed={data.settings.showAutopilot}
          onClick={() => store.setShowAutopilot(!data.settings.showAutopilot)}
        >
          {data.settings.showAutopilot ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
          {data.settings.showAutopilot ? 'Hide' : 'Show'} habit & autopilot reference
        </button>
      </section>

      <section className="card mb-6 p-5">
        <p className="label mb-2">Weather</p>
        <p className="text-sm text-paper/85">
          Forecasts come from Open-Meteo (free, no account). Location: <strong>{data.settings.location?.label ?? 'St. Petersburg (default)'}</strong>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            aria-pressed={data.settings.weatherAware}
            onClick={() => store.setSettings({ weatherAware: !data.settings.weatherAware })}
          >
            Weather-aware picks: {data.settings.weatherAware ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!('geolocation' in navigator)) return store.notify('Location not available');
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  // Rounded to ~1 km: precise enough for weather, never stored exactly.
                  const round = (n: number) => Math.round(n * 100) / 100;
                  store.setSettings({ location: { lat: round(pos.coords.latitude), lon: round(pos.coords.longitude), label: 'My area' } });
                  store.notify('Using your area for weather');
                },
                () => store.notify('Location permission declined'),
                { maximumAge: 3_600_000, timeout: 10_000 },
              );
            }}
          >
            Use my location
          </button>
          {data.settings.location && (
            <button type="button" className="btn-ghost text-sm" onClick={() => store.setSettings({ location: null })}>
              Reset to St. Petersburg
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">When weather-aware is on and the forecast is wet or stormy, outdoor-only ideas are skipped.</p>
      </section>

      <section className="card mb-6 p-5">
        <p className="label mb-2 flex items-center gap-2">
          <Smartphone size={14} aria-hidden /> Install on iPhone
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-paper/85">
          <li>Open this site in Safari.</li>
          <li>Tap the Share button, then “Add to Home Screen”.</li>
          <li>Open it from the home screen icon — it runs full-screen and works offline after the first visit.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          The home-screen app keeps its own storage, separate from Safari tabs. Use export/import to move data between them.
        </p>
      </section>

      <section className="border border-dashed border-line p-5">
        <p className="label mb-2">Start over</p>
        <p className="text-sm text-muted">
          Clears saved items, notes, favorites and custom entries on this device only, and disconnects sync here. Your other
          devices and the GitHub copy are untouched. Export first if in doubt.
        </p>
        <button
          type="button"
          className="btn mt-3"
          onClick={() => {
            if (confirm('Erase all personal data on this device? This cannot be undone.')) {
              sync.disconnect();
              store.resetAll();
              store.notify('Personal data cleared');
            }
          }}
        >
          <Trash2 size={14} aria-hidden /> Erase personal data
        </button>
      </section>
    </div>
  );
}
