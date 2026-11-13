import { useEffect, useState } from 'react';
import { AdminPanel } from './components/admin/AdminPanel';
import { WheelPage } from './components/LuckyWheel';

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '');
}

/** "/" is the public wheel, "#/admin" is the settings area. */
export default function App() {
  const route = useHashRoute();
  return route === 'admin' ? <AdminPanel /> : <WheelPage />;
}
