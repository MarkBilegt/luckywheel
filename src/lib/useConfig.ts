import { useCallback, useEffect, useState } from 'react';
import type { PublicConfig } from '../types';
import { fetchWheel } from './api';

/** The wheel as visitors see it. Re-fetches when the tab becomes visible again, so admin changes show up. */
export function usePublicWheel() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConfig(await fetchWheel());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Алдаа гарлаа.');
    }
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return { config, error, reload: load };
}
