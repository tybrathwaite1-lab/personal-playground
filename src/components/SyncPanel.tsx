import { useState, type FormEvent } from 'react';
import { ArrowUpRight, RefreshCw, Unplug } from 'lucide-react';
import { useSync } from '../hooks/useSync';
import { parseRepo } from '../utils/github';
import { Field } from './ui';

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(t).toLocaleDateString();
}

export function SyncPanel() {
  const sync = useSync();
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const r = parseRepo(repo);
    if (!r) return setFormError('Enter the repository as owner/name, e.g. yourname/playground-data.');
    if (!token.trim()) return setFormError('Paste your access token.');
    setBusy(true);
    try {
      await sync.connect({ ...r, path: 'playground-data.json', token: token.trim() });
      setToken('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Couldn’t connect.');
    } finally {
      setBusy(false);
    }
  };

  if (sync.config) {
    return (
      <div>
        <p className="text-sm text-paper/90">
          Syncing with{' '}
          <a
            className="underline underline-offset-4 hover:text-rust"
            href={`https://github.com/${sync.config.owner}/${sync.config.repo}`}
            target="_blank"
            rel="noreferrer"
          >
            {sync.config.owner}/{sync.config.repo}
          </a>{' '}
          (private).
        </p>
        <p className="mt-1 font-mono text-xs text-muted" aria-live="polite">
          {sync.status === 'syncing'
            ? 'Syncing…'
            : sync.lastSyncedAt
              ? `Last synced ${ago(sync.lastSyncedAt)}`
              : 'Not synced yet'}
          {!navigator.onLine && ' · offline — will sync when you’re back'}
        </p>
        {sync.error && (
          <p className="mt-2 border-l-2 border-rust pl-3 text-sm text-rust" role="alert">
            {sync.error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => void sync.syncNow()} disabled={sync.status === 'syncing'}>
            <RefreshCw size={14} aria-hidden className={sync.status === 'syncing' ? 'animate-spin' : ''} /> Sync now
          </button>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => confirm('Stop syncing on this device? Your data stays here and on GitHub.') && sync.disconnect()}
          >
            <Unplug size={14} aria-hidden /> Disconnect this device
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Changes sync a few seconds after you make them, and whenever you open the app. Edits made offline sync later.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-paper/85">
        Keep your phone and laptop in step by storing your data in a <strong>private</strong> GitHub repository. Set this up
        once on each device.
      </p>
      <details className="mt-3 border border-line p-3 text-sm">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-label text-muted">How to set it up (5 minutes)</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-paper/85">
          <li>
            <a className="inline-flex items-center gap-1 underline underline-offset-4" href="https://github.com/new" target="_blank" rel="noreferrer">
              Create a new repository <ArrowUpRight size={12} aria-hidden />
            </a>{' '}
            named <code className="font-mono">playground-data</code> and set it to <strong>Private</strong>.
          </li>
          <li>
            <a
              className="inline-flex items-center gap-1 underline underline-offset-4"
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
            >
              Create a fine-grained token <ArrowUpRight size={12} aria-hidden />
            </a>
            : under Repository access choose <em>Only select repositories</em> → <code className="font-mono">playground-data</code>.
            Under Permissions → Repository permissions, set <em>Contents</em> to <strong>Read and write</strong>. Nothing else.
          </li>
          <li>Pick an expiration you’ll remember (e.g. one year). When it expires, make a new one and paste it here.</li>
          <li>Paste the repo name and token below. Do the same on your other device.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          The token stays in this browser only — it’s never in your backups or the public app repo. Lost a device? Delete the
          token on GitHub and it stops working instantly.
        </p>
      </details>
      <form onSubmit={submit} className="mt-4">
        <Field label="Private repository">
          <input
            className="input"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="yourname/playground-data"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Fine-grained access token">
          <input
            className="input font-mono text-sm"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        {formError && (
          <p className="mb-3 text-sm text-rust" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Checking…' : 'Connect & sync'}
        </button>
      </form>
    </div>
  );
}
