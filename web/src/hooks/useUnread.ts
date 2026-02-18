import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'nanoclaw-last-read';

function getLastRead(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function useUnread() {
  const [lastRead, setLastRead] = useState<Record<string, string>>(getLastRead);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lastRead));
  }, [lastRead]);

  const markRead = useCallback((jid: string) => {
    setLastRead((prev) => ({ ...prev, [jid]: new Date().toISOString() }));
  }, []);

  const getLastReadTimestamp = useCallback((jid: string) => {
    return lastRead[jid] || '';
  }, [lastRead]);

  return { markRead, getLastReadTimestamp };
}
