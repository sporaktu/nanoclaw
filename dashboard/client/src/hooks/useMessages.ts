import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message } from '../types';

export function useMessages(jid: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const jidRef = useRef(jid);

  useEffect(() => {
    jidRef.current = jid;
    if (!jid) {
      setMessages([]);
      return;
    }
    setLoading(true);
    fetch(`/api/conversations/${encodeURIComponent(jid)}/messages?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (jidRef.current === jid) {
          setMessages(data.messages);
          setHasMore(data.hasMore);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [jid]);

  const addMessage = useCallback((msg: Message) => {
    if (msg.chat_jid !== jidRef.current) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) {
        return prev.map((m) => m.id === msg.id ? { ...msg, status: 'sent' as const } : m);
      }
      return [...prev, msg];
    });
  }, []);

  const addOptimistic = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, { ...msg, status: 'sending' as const }]);
  }, []);

  const ackMessage = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => m.id === id ? { ...m, status: 'sent' as const } : m),
    );
  }, []);

  const loadMore = useCallback(async () => {
    if (!jid || messages.length === 0 || !hasMore) return;
    const oldest = messages[0].timestamp;
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(jid)}/messages?limit=50&before=${encodeURIComponent(oldest)}`,
    );
    const data = await res.json();
    setMessages((prev) => [...data.messages, ...prev]);
    setHasMore(data.hasMore);
  }, [jid, messages, hasMore]);

  return { messages, loading, hasMore, loadMore, addMessage, addOptimistic, ackMessage };
}
