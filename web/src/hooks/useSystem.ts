import { useState, useEffect, useCallback } from 'react';
import type { SystemStatus, RegisteredGroupInfo } from '../types';

interface SystemData {
  status: { activeContainers: number; connectedClients: number; uptime: number } | null;
  groups: RegisteredGroupInfo[];
  sessions: Record<string, string>;
}

export function useSystem() {
  const [data, setData] = useState<SystemData>({ status: null, groups: [], sessions: {} });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, groupsRes, sessionsRes] = await Promise.all([
        fetch('/api/system/status'),
        fetch('/api/system/groups'),
        fetch('/api/system/sessions'),
      ]);
      const [status, groups, sessions] = await Promise.all([
        statusRes.json(),
        groupsRes.json(),
        sessionsRes.json(),
      ]);
      setData({ status, groups, sessions });
    } catch (err) {
      console.error('Failed to load system data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { ...data, loading, refresh };
}
