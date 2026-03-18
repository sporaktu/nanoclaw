import type { Conversation } from '../types';
import './Sidebar.css';

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WA',
  slack: 'SL',
  telegram: 'TG',
  discord: 'DC',
  web: 'WEB',
  terminal: 'CLI',
};

interface Props {
  conversations: Conversation[];
  selectedJid: string | null;
  onSelect: (jid: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Sidebar({ conversations, selectedJid, onSelect, showArchived, onToggleArchived }: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Conversations</h1>
      </div>
      <div className="sidebar-list">
        {conversations.map((c) => (
          <button
            key={c.jid}
            className={`sidebar-item ${c.jid === selectedJid ? 'active' : ''}`}
            onClick={() => onSelect(c.jid)}
          >
            <span className={`channel-badge ${c.channel}`}>
              {CHANNEL_LABELS[c.channel] ?? c.channel.slice(0, 3).toUpperCase()}
            </span>
            <span className="sidebar-item-text">
              <span className="sidebar-item-name">{c.display_name ?? c.name ?? c.jid}</span>
              <span className="sidebar-item-time">{formatTime(c.lastActivity)}</span>
            </span>
          </button>
        ))}
        {conversations.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No conversations
          </div>
        )}
      </div>
      <div className="sidebar-footer">
        <button className="archive-toggle" onClick={onToggleArchived}>
          {showArchived ? '← Active chats' : 'Show archived'}
        </button>
      </div>
    </div>
  );
}
