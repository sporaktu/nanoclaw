import { useState, useEffect, useCallback } from 'react';
import type { Conversation } from '../types';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?archived=${showArchived ? '1' : '0'}`);
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { refresh(); }, [refresh]);

  const createChat = useCallback(async (name: string) => {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    await refresh();
    return data;
  }, [refresh]);

  const renameChat = useCallback(async (jid: string, displayName: string) => {
    await fetch(`/api/chats/${encodeURIComponent(jid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName }),
    });
    await refresh();
  }, [refresh]);

  const archiveChat = useCallback(async (jid: string) => {
    await fetch(`/api/chats/${encodeURIComponent(jid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    await refresh();
  }, [refresh]);

  const deleteChat = useCallback(async (jid: string) => {
    await fetch(`/api/chats/${encodeURIComponent(jid)}`, { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  return { conversations, loading, refresh, showArchived, setShowArchived, createChat, renameChat, archiveChat, deleteChat };
}
