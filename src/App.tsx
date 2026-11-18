import { Suspense, lazy, useEffect } from 'react';
import { Layout, NAV } from './components/Layout';
import { useRoute } from './hooks/useRoute';
import Backup from './pages/Backup';
import Collection from './pages/Collection';
import Digital from './pages/Digital';
import Discover from './pages/Discover';
import FieldNotes from './pages/FieldNotes';
import Home from './pages/Home';
import Interests from './pages/Interests';
import Local from './pages/Local';
import Plan from './pages/Plan';
import Pulse from './pages/Pulse';
import Drop from './pages/Drop';
import Rediscover from './pages/Rediscover';

// Hidden review route (#/styleguide), code-split so it adds nothing to the app bundle.
const StyleGuide = lazy(() => import('./styleguide/StyleGuide'));

export default function App() {
  const route = useRoute();

  useEffect(() => {
    if (route.preview === 'styleguide') {
      document.title = 'Style guide (preview) — Personal Playground';
      return;
    }
    const label = NAV.find((n) => n.route === route.name)?.label ?? (route.name === 'backup' ? 'Backup' : '');
    document.title = route.name === 'home' ? 'Personal Playground' : `${label} — Personal Playground`;
  }, [route.name, route.preview]);

  if (route.preview === 'styleguide') {
    return (
      <Suspense fallback={<p className="p-6 font-mono text-xs uppercase tracking-label text-fg-muted">Loading style guide…</p>}>
        <StyleGuide />
      </Suspense>
    );
  }

  const page = (() => {
    switch (route.name) {
      case 'discover':
        return <Discover params={route.params} />;
      case 'plan':
        return <Plan params={route.params} />;
      case 'drop':
        return <Drop params={route.params} />;
      case 'pulse':
        return <Pulse params={route.params} />;
      case 'interests':
        return <Interests />;
      case 'local':
        return <Local params={route.params} />;
      case 'digital':
        return <Digital />;
      case 'rediscover':
        return <Rediscover />;
      case 'collection':
        return <Collection />;
      case 'notes':
        return <FieldNotes />;
      case 'backup':
        return <Backup />;
      default:
        return <Home />;
    }
  })();

  return (
    <Layout current={route.name}>
      <div key={route.name}>{page}</div>
    </Layout>
  );
}
