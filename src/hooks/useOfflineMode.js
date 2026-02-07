import { useOfflineCache } from './useOfflineCache.js';
import { useOfflineStatus } from './useOfflineStatus.js';

export function useOfflineMode() {
  const { offline } = useOfflineStatus();
  const { enabled: offlineEnabled } = useOfflineCache();
  return {
    offlineMode: Boolean(offline || offlineEnabled),
    offlineEnabled,
    offline,
  };
}
