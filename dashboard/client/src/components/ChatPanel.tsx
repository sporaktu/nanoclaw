import { useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import { useMessages } from '../hooks/useMessages';
import type { Conversation, WsMessage } from '../types';
import './ChatPanel.css';

interface Props {
  conversation: Conversation | null;
  wsMessage: WsMessage | null;
}

function formatDateLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function ChatPanel({ conversation, wsMessage }: Props) {
  const { messages, loading, hasMore, loadMore, addMessage } = useMessages(
    conversation?.jid ?? null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (wsMessage?.type === 'newMessage' && wsMessage.message) {
      addMessage(wsMessage.message);
    }
  }, [wsMessage, addMessage]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleLoadMore = useCallback(() => {
    loadMore();
  }, [loadMore]);

  if (!conversation) {
    return (
      <div className="chat-area">
        <div className="chat-placeholder">Select a conversation to view messages</div>
      </div>
    );
  }

  // Insert date dividers
  const items: Array<{ type: 'date'; label: string } | { type: 'msg'; index: number }> = [];
  let lastDate = '';
  messages.forEach((msg, i) => {
    const d = new Date(msg.timestamp);
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dateKey !== lastDate) {
      items.push({ type: 'date', label: formatDateLabel(msg.timestamp) });
      lastDate = dateKey;
    }
    items.push({ type: 'msg', index: i });
  });

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>{conversation.display_name ?? conversation.name ?? conversation.jid}</h2>
        <span className="chat-channel">{conversation.channel}</span>
      </div>
      <div className="chat-messages">
        {hasMore && (
          <button className="load-more" onClick={handleLoadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load earlier messages'}
          </button>
        )}
        {loading && messages.length === 0 && (
          <div className="chat-loading">Loading messages...</div>
        )}
        {items.map((item, i) =>
          item.type === 'date' ? (
            <div key={`date-${i}`} className="date-divider">
              <span>{item.label}</span>
            </div>
          ) : (
            <MessageBubble key={messages[item.index]!.id} message={messages[item.index]!} />
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
