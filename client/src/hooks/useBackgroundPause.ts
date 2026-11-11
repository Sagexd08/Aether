import { useCallback, useState } from 'react';

const PAUSE_KEY = 'aether_pause_background';

function read(): boolean {
  try {
    return localStorage.getItem(PAUSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useBackgroundPause(): [boolean, () => void] {
  const [paused, setPaused] = useState(read);

  const toggle = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      try {
        localStorage.setItem(PAUSE_KEY, next ? '1' : '0');
      } catch {
        return next;
      }
      return next;
    });
  }, []);

  return [paused, toggle];
}
