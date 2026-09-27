import { useEffect } from 'react';
import { store, useGame } from './store';
import { StartScreen } from './screens/StartScreen';
import { TopBar } from './components/TopBar';
import { Nav } from './components/Nav';
import { ModalHost } from './components/ModalHost';
import { HQ } from './screens/HQ';
import { Projects } from './screens/Projects';
import { ProjectView } from './screens/ProjectView';
import { Models } from './screens/Models';
import { ModelView } from './screens/ModelView';
import { Factory } from './screens/Factory';
import { Markets } from './screens/Markets';
import { Finance } from './screens/Finance';
import { Cards } from './screens/Cards';
import { Settings } from './screens/Settings';

export function App() {
  const { state } = useGame();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!store.state) return;
      if (e.code === 'Space') {
        e.preventDefault();
        store.togglePause();
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        store.setSpeed(Number(e.key) as 1 | 2 | 3);
      }
    };
    const onHide = () => store.save();
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onHide);
    };
  }, []);

  if (!state) return <StartScreen />;

  const sc = store.screen;
  let body;
  switch (sc.id) {
    case 'hq':
      body = <HQ />;
      break;
    case 'projects':
      body = <Projects />;
      break;
    case 'project':
      body = state.projects.some((p) => p.id === sc.projectId) ? <ProjectView projectId={sc.projectId} /> : <Projects />;
      break;
    case 'models':
      body = <Models />;
      break;
    case 'model':
      body = state.models.some((m) => m.id === sc.modelId) ? <ModelView modelId={sc.modelId} /> : <Models />;
      break;
    case 'factory':
      body = <Factory />;
      break;
    case 'markets':
      body = <Markets />;
      break;
    case 'finance':
      body = <Finance />;
      break;
    case 'cards':
      body = <Cards />;
      break;
    case 'settings':
      body = <Settings />;
      break;
  }

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Nav />
        <main className="main">{body}</main>
      </div>
      <ModalHost />
      {store.toast && (
        <div className={`toast toast-${store.toast.tone}`} role="status">
          {store.toast.text}
        </div>
      )}
    </div>
  );
}
