import { useEffect, useRef, useState, type RefObject } from 'react';
import { Credit } from '../../components/EditorialImage';
import { InPageLink } from '../../components/InPageLink';
import { isPermittedImageLicense } from '../../data/imageLicenses';
import { IMAGES } from '../../data/images';
import { hostname, isSafeUrl } from '../../utils/helpers';
import { connections, href, longDate, lookup, parsePreview, PREVIEW_FILE, type Connection, type Preview, type PreviewRecord } from './data';
import './living.css';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; preview: Preview };

/**
 * The discovery experience preview (PR 3): one discovery at a time, with its creators, the
 * original destination, sources on request, and the connections authored around it. Unlisted:
 * nothing in the app links here. It reads only the preview file, saves nothing and tracks
 * nothing; the path below a discovery lives in memory and is gone on reload.
 */
export default function Living({ params }: { params: URLSearchParams }) {
  const d = params.get('d');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [path, setPath] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}${PREVIEW_FILE}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((raw: unknown) => {
        const preview = parsePreview(raw);
        if (live) setLoad(preview ? { state: 'ready', preview } : { state: 'error' });
      })
      .catch(() => live && setLoad({ state: 'error' }));
    return () => {
      live = false;
    };
  }, []);

  // Keep unlisted pages out of search results while this route is open.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const view = load.state === 'ready' ? lookup(load.preview, d) : null;
  const current = view?.kind === 'found' ? view.record : null;

  useEffect(() => {
    if (load.state === 'loading') return;
    const name = current ? current.title : view?.kind === 'missing' ? 'Not found' : load.state === 'error' ? 'Unavailable' : 'Discoveries';
    document.title = `${name} (preview) — Personal Playground`;
  }, [load.state, current, view?.kind]);

  // The path: each discovery opened in this page's lifetime, in order, without repeats.
  useEffect(() => {
    if (current) setPath((p) => (p.includes(current.id) ? p : [...p, current.id]));
  }, [current]);

  // After moving to another discovery (a link, Back or Forward), focus its heading so keyboard
  // and screen-reader users start at the top of what changed. Not on first arrival.
  useEffect(() => {
    if (load.state !== 'ready') return;
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [d, load.state]);

  return (
    <div className="living" data-living="">
      <InPageLink to="main" className="living-skip">
        Skip to the discovery
      </InPageLink>
      <header className="living-masthead">
        <a href="#/" className="living-wordmark">
          Personal Playground
        </a>
        <p className="living-status">Preview, not yet published</p>
      </header>
      <main id="main" tabIndex={-1} className="living-main" data-living-view={load.state === 'ready' ? view!.kind : load.state}>
        {load.state === 'loading' && (
          <p className="living-wait" role="status">
            Loading the preview…
          </p>
        )}
        {load.state === 'error' && (
          <section className="living-notice">
            <h1 ref={heading} tabIndex={-1}>
              The preview didn't load
            </h1>
            <p>Check your connection, then reload the page.</p>
          </section>
        )}
        {load.state === 'ready' && view!.kind === 'index' && (
          <section className="living-notice">
            <h1 ref={heading} tabIndex={-1}>
              Discoveries in preview
            </h1>
            <p>Each one has been checked and credited, and none is published yet. Open any of them.</p>
            <Index preview={load.preview} />
          </section>
        )}
        {load.state === 'ready' && view!.kind === 'missing' && (
          <section className="living-notice">
            <h1 ref={heading} tabIndex={-1}>
              There's no discovery here
            </h1>
            <p>The link may be mistyped, or this discovery isn't part of the preview. These ones are.</p>
            <Index preview={load.preview} />
          </section>
        )}
        {load.state === 'ready' && current && (
          <>
            <Discovery key={current.id} record={current} preview={load.preview} heading={heading} />
            <Onward preview={load.preview} current={current.id} path={path} />
          </>
        )}
      </main>
      <footer className="living-footer">
        <p>A preview of discoveries that have been verified but not published. Nothing you do here is saved or tracked.</p>
      </footer>
    </div>
  );
}

function Discovery({ record: r, preview, heading }: { record: PreviewRecord; preview: Preview; heading: RefObject<HTMLHeadingElement> }) {
  const image = r.image ? IMAGES.find((i) => i.id === r.image && isPermittedImageLicense(i.license)) : undefined;
  const links = connections(preview, r.id);
  const base = `${import.meta.env.BASE_URL}images/editorial/`;
  return (
    <article className="living-discovery" data-discovery={r.id} data-composition={image ? 'image' : 'type'} aria-labelledby="living-title">
      {image && (
        <figure className="living-figure">
          <img
            src={`${base}${image.id}-1200.webp`}
            srcSet={`${base}${image.id}-600.webp 600w, ${base}${image.id}-1200.webp 1200w`}
            sizes="(min-width: 960px) 60vw, 100vw"
            alt={image.alt}
            decoding="async"
            style={{ objectPosition: image.focus ?? 'center' }}
          />
          <Credit meta={image} />
        </figure>
      )}
      <header className="living-head">
        <p className="living-subject">
          {r.subject}
          {r.year && (
            <span className="living-year">
              <span className="sr-only">, </span>
              {r.year}
            </span>
          )}
        </p>
        <h1 id="living-title" ref={heading} tabIndex={-1}>
          {r.title}
        </h1>
      </header>

      <p className="living-context">{r.context}</p>

      <section className="living-credits" aria-labelledby="living-credits-h">
        <h2 id="living-credits-h" className="living-label">
          {r.credits.length === 0 ? 'Where to find it' : r.nature === 'work' ? 'Made by' : 'Credits'}
        </h2>
        {r.credits.length > 0 && (
          <ul className="living-people">
            {r.credits.map((c) => (
              <li key={`${c.name}|${c.role}`}>
                <span className="living-name">{c.name}</span>
                <span className="living-role">{c.role}</span>
              </li>
            ))}
          </ul>
        )}
        {isSafeUrl(r.destination.url) && (
        <a className="living-visit" href={r.destination.url} target="_blank" rel="noopener noreferrer" data-destination="">
          <span className="living-visit-cta">Visit the original</span>
          <span className="living-visit-label">{r.destination.label}</span>
          <span className="living-visit-host">
            {hostname(r.destination.url)}
            <span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </span>
        </a>
        )}
        {r.destination.availability === 'intermittent' && <p className="living-aside">This site goes offline at times, by design.</p>}
        {r.destination.availability === 'javascript-required' && <p className="living-aside">This site needs JavaScript turned on in your browser.</p>}
        {r.sources.some((s) => isSafeUrl(s.url)) && (
          <details className="living-sources">
            <summary>Sources and further reading</summary>
            <ul>
              {r.sources.filter((s) => isSafeUrl(s.url)).map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <span className="living-aside">
                    {hostname(s.url)}
                    {longDate(s.verifiedAt) && `, checked ${longDate(s.verifiedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="living-connections" aria-labelledby="living-connections-h" data-connections={links.length}>
        {links.length > 0 ? (
          <>
            <h2 id="living-connections-h">There are connections here.</h2>
            <ul>
              {links.map((c) => (
                <ConnectionItem key={`${c.claim.from}|${c.claim.to}|${c.claim.relation}|${c.claim.basis}`} c={c} current={r.id} />
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 id="living-connections-h">This one stands on its own.</h2>
            <p className="living-aside">Nothing in the preview connects to it yet, and we don't invent connections. Follow it to the original instead, or try another discovery below.</p>
          </>
        )}
      </section>
    </article>
  );
}

function ConnectionItem({ c, current }: { c: Connection; current: string }) {
  const name = (rec: PreviewRecord) =>
    rec.id === current ? (
      <span className="living-self">{rec.subject}</span>
    ) : (
      <a href={href(rec.id)} data-related={rec.id} aria-label={`${rec.subject}: ${rec.title}`}>
        {rec.subject}
      </a>
    );
  return (
    <li data-basis={c.claim.basis} data-direction={c.direction}>
      <p className="living-claim">
        {name(c.from)} {c.claim.relation} {name(c.to)}.
      </p>
      <p className="living-note">{c.claim.note}</p>
      <p className="living-basis">{c.claim.basis === 'fact' ? 'Documented connection' : 'Editorial association, not a documented link'}</p>
    </li>
  );
}

function Onward({ preview, current, path }: { preview: Preview; current: string; path: string[] }) {
  const trail = path.map((id) => preview.get(id)).filter((r): r is PreviewRecord => !!r);
  return (
    <div className="living-onward">
      {trail.length > 1 && (
        <nav aria-labelledby="living-path-h" className="living-path">
          <h2 id="living-path-h" className="living-label">
            Your path so far
          </h2>
          <ol>
            {trail.map((r) => (
              <li key={r.id}>{r.id === current ? <span aria-current="page">{r.subject}</span> : <a href={href(r.id)}>{r.subject}</a>}</li>
            ))}
          </ol>
        </nav>
      )}
      <nav aria-labelledby="living-index-h">
        <h2 id="living-index-h" className="living-label">
          Also in this preview
        </h2>
        <Index preview={preview} current={current} />
      </nav>
    </div>
  );
}

function Index({ preview, current }: { preview: Preview; current?: string }) {
  return (
    <ul className="living-index">
      {preview.list.map((r) => (
        <li key={r.id}>
          {r.id === current ? (
            <span aria-current="page" className="living-index-entry">
              <span className="living-index-subject">{r.subject}</span>
              <span className="living-index-title">{r.title}</span>
            </span>
          ) : (
            <a href={href(r.id)} className="living-index-entry">
              <span className="living-index-subject">{r.subject}</span>
              <span className="living-index-title">{r.title}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
