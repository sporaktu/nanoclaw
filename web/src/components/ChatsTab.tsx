import { useState, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import { useConversations } from '../hooks/useConversations';
import { useUnread } from '../hooks/useUnread';
import type { Message } from '../types';
import './ChatsTab.css';

interface Props {
  send: (data: Record<string, unknown>) => void;
  connected: boolean;
  addMessageRef: MutableRefObject<((msg: Message) => void) | null>;
  refreshRef: MutableRefObject<(() => void) | null>;
  typingRef: MutableRefObject<((jid: string, value: boolean) => void) | null>;
  ackMessageRef: MutableRefObject<((id: string) => void) | null>;
}

export default function ChatsTab({ send, connected, addMessageRef, refreshRef, typingRef, ackMessageRef }: Props) {
  const {
    conversations, refresh, showArchived, setShowArchived,
    createChat, renameChat, archiveChat, deleteChat,
  } = useConversations();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [typingJids, setTypingJids] = useState<Set<string>>(new Set());
  const { markRead, getLastReadTimestamp } = useUnread();
  const addOptimisticRef = useRef<((msg: Message) => void) | null>(null);

  const handleSelect = useCallback((jid: string) => {
    setSelectedJid(jid);
    markRead(jid);
  }, [markRead]);

  // Expose refresh to parent for WS updates
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh, refreshRef]);

  // Wire typing callback from parent WS handler
  useEffect(() => {
    typingRef.current = (jid: string, value: boolean) => {
      setTypingJids((prev) => {
        const next = new Set(prev);
        if (value) next.add(jid);
        else next.delete(jid);
        return next;
      });
    };
  }, [typingRef]);

  const handleSend = useCallback((jid: string, content: string) => {
    const id = `web-${Date.now()}`;
    const msg: Message = {
      id,
      chat_jid: jid,
      sender: 'web-user',
      sender_name: 'User',
      content,
      timestamp: new Date().toISOString(),
      is_from_me: false,
      is_bot_message: false,
      status: 'sending',
    };
    addOptimisticRef.current?.(msg);
    send({ type: 'message', jid, content, id });
  }, [send]);

  const handleNewChat = useCallback(async () => {
    const name = prompt('Chat name:');
    if (!name) return;
    const data = await createChat(name);
    if (data?.jid) setSelectedJid(data.jid);
  }, [createChat]);

  const selectedConversation = conversations.find((c) => c.jid === selectedJid);

  return (
    <div className="chats-tab">
      <Sidebar
        conversations={conversations}
        selected={selectedJid}
        onSelect={handleSelect}
        unreadSince={getLastReadTimestamp}
        onNewChat={handleNewChat}
        onRename={renameChat}
        onArchive={archiveChat}
        onDelete={deleteChat}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived(!showArchived)}
      />
      <main className="chat-area">
        {selectedConversation ? (
          <ChatPanel
            conversation={selectedConversation}
            onSend={handleSend}
            typing={typingJids.has(selectedConversation.jid)}
            onAddMessage={(cb) => { addMessageRef.current = cb; }}
            onAddOptimistic={(cb) => { addOptimisticRef.current = cb; }}
            onAckMessage={(cb) => { ackMessageRef.current = cb; }}
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
