import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { href } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';
import type { Place } from '../types';
import { cachedCoords, geocodePlaces } from '../utils/geocode';
import { directionsLink } from '../utils/helpers';

const ST_PETE: L.LatLngTuple = [27.82, -82.62];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** OpenStreetMap view of the (already filtered) places. Lazy-loaded by the Local page. */
export default function PlacesMap({ places }: { places: Place[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const { data } = useStore();
  const favKey = data.favorites.join(',');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [version, setVersion] = useState(0);

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(ST_PETE, 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // Look up any coordinates we don't have yet (1 per second, cached on device).
  const placeKey = places.map((p) => p.id).join(',');
  useEffect(() => {
    const missing = places.filter((p) => cachedCoords(p) === undefined);
    if (!missing.length || !navigator.onLine) return;
    const ctrl = new AbortController();
    setProgress({ done: 0, total: missing.length });
    geocodePlaces(
      missing,
      (done, total) => {
        setProgress({ done, total });
        setVersion((v) => v + 1);
      },
      ctrl.signal,
    ).finally(() => setProgress(null));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey]);

  // Draw markers.
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const points: L.LatLngTuple[] = [];
    for (const p of places) {
      const c = cachedCoords(p);
      if (!c) continue;
      const fav = data.favorites.includes(p.id);
      const icon = L.divIcon({
        className: '',
        html: `<span class="pp-pin${fav ? ' pp-pin--fav' : ''}${c.approximate ? ' pp-pin--approx' : ''}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10],
      });
      const popup = `
        <div class="pp-popup">
          <p class="pp-popup__cat">${esc(p.categories[0])}</p>
          <p class="pp-popup__name">${esc(p.name)}</p>
          <p class="pp-popup__hood">${esc(p.neighborhood)}${c.approximate ? ' · approximate pin' : ''}</p>
          <p class="pp-popup__links">
            <a href="${href('local', { place: p.id })}">Details</a>
            <a href="${directionsLink(p)}" target="_blank" rel="noreferrer">Directions</a>
          </p>
        </div>`;
      L.marker([c.lat, c.lon], { icon, title: p.name, keyboard: true }).bindPopup(popup).addTo(g);
      points.push([c.lat, c.lon]);
    }
    if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 14 });
    else if (points.length === 1) m.setView(points[0], 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, version, favKey]);

  const unmapped = places.filter((p) => !cachedCoords(p));

  return (
    <div>
      <div ref={el} className="pp-map h-[60vh] min-h-[360px] w-full border border-line" role="region" aria-label="Map of places" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="label" aria-live="polite">
          {progress ? `Placing pins… ${progress.done}/${progress.total}` : 'Square = place · orange = favorite · hollow = approximate'}
        </p>
        {!navigator.onLine && <p className="label text-rust">The map needs a connection.</p>}
      </div>
      {unmapped.length > 0 && !progress && (
        <p className="mt-2 text-xs text-muted">
          Not on the map: {unmapped.map((p) => p.name).join(', ')}.
        </p>
      )}
    </div>
  );
}
