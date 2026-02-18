import { useState, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import { useConversations } from './hooks/useConversations';
import { useWebSocket } from './hooks/useWebSocket';
import type { Message, WsMessage } from './types';
import './App.css';

export default function App() {
  const { conversations, refresh } = useConversations();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [typingJids, setTypingJids] = useState<Set<string>>(new Set());
  const addMessageRef = useRef<((msg: Message) => void) | null>(null);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'newMessage' && msg.message) {
      addMessageRef.current?.(msg.message);
      refresh();
    }
    if (msg.type === 'typing' && msg.jid !== undefined) {
      setTypingJids((prev) => {
        const next = new Set(prev);
        if (msg.value) next.add(msg.jid!);
        else next.delete(msg.jid!);
        return next;
      });
    }
  }, [refresh]);

  const { send, connected } = useWebSocket(handleWsMessage);

  const handleSend = useCallback((jid: string, content: string) => {
    send({ type: 'message', jid, content });
  }, [send]);

  const selectedConversation = conversations.find((c) => c.jid === selectedJid);

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        selected={selectedJid}
        onSelect={setSelectedJid}
      />
      <main className="chat-area">
        {selectedConversation ? (
          <ChatPanel
            conversation={selectedConversation}
            onSend={handleSend}
            typing={typingJids.has(selectedConversation.jid)}
            onAddMessage={(cb) => { addMessageRef.current = cb; }}
          />
        ) : (
          <div className="chat-placeholder">
            {connected ? 'Select a conversation' : 'Connecting...'}
          </div>
        )}
      </main>
    </div>
  );
}
