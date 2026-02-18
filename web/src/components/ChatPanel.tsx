import { useEffect, useRef } from 'react';

function formatDateDivider(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function getDateKey(timestamp: string): string {
  return new Date(timestamp).toDateString();
}
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { useMessages } from '../hooks/useMessages';
import type { Conversation, Message } from '../types';
import './ChatPanel.css';

interface Props {
  conversation: Conversation;
  onSend: (jid: string, content: string) => void;
  typing: boolean;
  onAddMessage: (cb: (msg: Message) => void) => void;
}

export default function ChatPanel({ conversation, onSend, typing, onAddMessage }: Props) {
  const { messages, loading, hasMore, loadMore, addMessage } = useMessages(conversation.jid);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Register addMessage with parent
  useEffect(() => {
    onAddMessage(addMessage);
  }, [addMessage, onAddMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typing]);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>{conversation.name}</h2>
        <span className="chat-channel">{conversation.channel}</span>
      </div>
      <div className="chat-messages">
        {hasMore && (
          <button className="load-more" onClick={loadMore}>
            Load older messages
          </button>
        )}
        {loading && <div className="chat-loading">Loading...</div>}
        {messages.map((msg, i) => {
          const showDivider = i === 0 || getDateKey(msg.timestamp) !== getDateKey(messages[i - 1].timestamp);
          return (
            <div key={msg.id}>
              {showDivider && (
                <div className="date-divider">
                  <span>{formatDateDivider(msg.timestamp)}</span>
                </div>
              )}
              <MessageBubble message={msg} />
            </div>
          );
        })}
        {typing && (
          <div className="typing-indicator">Thinking...</div>
        )}
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={(text) => onSend(conversation.jid, text)} />
    </div>
  );
}
