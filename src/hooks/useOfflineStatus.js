import { useEffect, useState } from 'react';

export function useOfflineStatus() {
  const [online, setOnline] = useState(() => (
    typeof navigator !== 'undefined' ? navigator.onLine : true
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { online, offline: !online };
}
