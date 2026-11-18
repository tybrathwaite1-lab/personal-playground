/**
 * Original placeholder illustrations for the style guide (simple SVG drawn for this preview,
 * no external images). They exist to exercise the artwork treatments; final artwork is
 * commissioned separately and credited.
 */
const c = (name: string) => ({ fill: `rgb(var(--pp-ns-${name}))` });

export function HarborSun() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="300" style={c('cobalt')} />
      <circle cx="270" cy="150" r="62" style={c('mustard')} />
      <rect y="168" width="400" height="132" style={c('forest')} />
      {[184, 204, 228, 256].map((y, i) => (
        <rect key={y} x={30 + i * 20} y={y} width={300 - i * 40} height="4" rx="2" style={c('cream')} opacity={0.75 - i * 0.12} />
      ))}
      {[60, 96, 132, 168].map((x) => (
        <rect key={x} x={x} y="150" width="9" height="90" style={c('ink')} />
      ))}
      <rect x="50" y="146" width="140" height="10" style={c('ink')} />
      <path d="M300 236 h52 l-10 14 h-34 z" style={c('pink')} />
      <rect x="324" y="206" width="3" height="30" style={c('cream')} />
      <path d="M327 208 l20 24 h-20 z" style={c('cream')} />
    </svg>
  );
}

export function RecordNight() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="300" style={c('ink')} />
      {[
        [40, 40],
        [90, 70],
        [340, 50],
        [370, 120],
        [60, 250],
        [330, 260],
        [210, 30],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" style={c('paper')} />
      ))}
      <circle cx="200" cy="160" r="112" style={{ fill: 'rgb(var(--pp-ink))' }} />
      {[100, 88, 76, 64].map((r) => (
        <circle key={r} cx="200" cy="160" r={r} fill="none" strokeOpacity="0.12" strokeWidth="1.5" style={{ stroke: 'rgb(var(--pp-ns-paper))' }} />
      ))}
      <circle cx="200" cy="160" r="38" style={c('orange')} />
      <circle cx="200" cy="160" r="5" style={c('ink')} />
      <path d="M300 60 q40 30 20 90" fill="none" strokeWidth="6" strokeLinecap="round" style={{ stroke: 'rgb(var(--pp-ns-mustard))' }} />
    </svg>
  );
}

export function Peaks() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="300" style={c('pink')} />
      <circle cx="300" cy="80" r="34" style={c('cream')} />
      <path d="M0 230 L90 110 L160 200 L240 90 L330 210 L400 150 V300 H0 Z" style={c('olive')} />
      <path d="M0 260 L120 190 L220 250 L320 200 L400 240 V300 H0 Z" style={c('forest')} />
      <path d="M240 90 l-22 30 l22 -8 l22 10 z" style={c('cream')} />
    </svg>
  );
}
