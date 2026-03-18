import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Conversation, WsMessage } from '../types';
import './ChatsTab.css';

const CHANNELS = ['all', 'whatsapp', 'slack', 'telegram', 'discord', 'web'] as const;
type ChannelFilter = (typeof CHANNELS)[number];

interface Props {
  conversations: Conversation[];
  loading: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
}

export default function ChatsTab({ conversations, loading, showArchived, onToggleArchived }: Props) {
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [lastWsMessage, setLastWsMessage] = useState<WsMessage | null>(null);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    setLastWsMessage(msg);
  }, []);

  useWebSocket(handleWsMessage);

  const filtered =
    channelFilter === 'all'
      ? conversations
      : conversations.filter((c) => c.channel === channelFilter);

  const selectedConversation = filtered.find((c) => c.jid === selectedJid) ?? null;

  // Detect which channel filters have at least one conversation
  const availableChannels = CHANNELS.filter(
    (ch) => ch === 'all' || conversations.some((c) => c.channel === ch),
  );

  if (loading && conversations.length === 0) {
    return (
      <div className="chats-tab">
        <div className="sidebar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="chats-tab">
      <div style={{ display: 'flex', flexDirection: 'column', width: 280, minWidth: 280 }}>
        <div className="channel-filters">
          {availableChannels.map((ch) => (
            <button
              key={ch}
              className={`filter-chip ${ch === channelFilter ? 'active' : ''}`}
              onClick={() => setChannelFilter(ch)}
            >
              {ch === 'all' ? 'All' : ch}
            </button>
          ))}
        </div>
        <Sidebar
          conversations={filtered}
          selectedJid={selectedJid}
          onSelect={setSelectedJid}
          showArchived={showArchived}
          onToggleArchived={onToggleArchived}
        />
      </div>
      <div className="chat-area">
        <ChatPanel conversation={selectedConversation} wsMessage={lastWsMessage} />
      </div>
    </div>
  );
}
