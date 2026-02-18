import { useState, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import { useConversations } from '../hooks/useConversations';
import type { Message } from '../types';
import './ChatsTab.css';

interface Props {
  send: (data: Record<string, unknown>) => void;
  connected: boolean;
  addMessageRef: MutableRefObject<((msg: Message) => void) | null>;
  refreshRef: MutableRefObject<(() => void) | null>;
}

export default function ChatsTab({ send, connected, addMessageRef, refreshRef }: Props) {
  const {
    conversations, refresh, showArchived, setShowArchived,
    createChat, renameChat, archiveChat, deleteChat,
  } = useConversations();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [typingJids, setTypingJids] = useState<Set<string>>(new Set());

  // Expose refresh to parent for WS updates
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh, refreshRef]);

  const handleSend = useCallback((jid: string, content: string) => {
    send({ type: 'message', jid, content });
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
        onSelect={setSelectedJid}
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
