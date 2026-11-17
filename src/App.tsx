import { useEffect } from 'react';
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
import Rediscover from './pages/Rediscover';

export default function App() {
  const route = useRoute();

  useEffect(() => {
    const label = NAV.find((n) => n.route === route.name)?.label ?? (route.name === 'backup' ? 'Backup' : '');
    document.title = route.name === 'home' ? 'Personal Playground' : `${label} — Personal Playground`;
  }, [route.name]);

  const page = (() => {
    switch (route.name) {
      case 'discover':
        return <Discover params={route.params} />;
      case 'plan':
        return <Plan params={route.params} />;
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
