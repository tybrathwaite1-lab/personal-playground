import { CloudRain, CloudSun, Sun, Thermometer, Zap } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { useWeather } from '../hooks/useWeather';
import { VERDICT_COPY, describeCode, type WeatherVerdict } from '../utils/weather';

const ICON: Record<WeatherVerdict, typeof Sun> = {
  nice: Sun,
  hot: Thermometer,
  wet: CloudRain,
  stormy: Zap,
  cool: CloudSun,
};

/** One-line forecast. With `toggle`, also shows the weather-aware switch. */
export function WeatherStrip({ toggle, hiddenCount }: { toggle?: boolean; hiddenCount?: number }) {
  const { weather, loading, location } = useWeather();
  const { data, setSettings } = useStore();
  if (!weather) {
    return loading ? <p className="label animate-flicker">Checking the sky over {location.label}…</p> : null;
  }
  const Icon = ICON[weather.verdict];
  const aware = data.settings.weatherAware;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <Icon size={16} className="text-rust" aria-hidden />
        <span>
          <span className="font-mono">{weather.tempF}°</span> {describeCode(weather.code)} · {location.label}
        </span>
      </span>
      <span className="text-muted">
        H {weather.highF}° / L {weather.lowF}° · {weather.rainChance}% rain — {VERDICT_COPY[weather.verdict]}
      </span>
      {toggle && (
        <button
          type="button"
          className="chip ml-auto"
          aria-pressed={aware}
          onClick={() => setSettings({ weatherAware: !aware })}
          title="When the forecast is wet or stormy, skip outdoor-only ideas"
        >
          Weather-aware{aware && hiddenCount ? ` · ${hiddenCount} hidden` : ''}
        </button>
      )}
    </div>
  );
}
