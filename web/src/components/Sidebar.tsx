import type { Conversation } from '../types';
import './Sidebar.css';

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: 'WA',
  slack: 'SL',
  web: 'WB',
  terminal: 'TM',
};

interface Props {
  conversations: Conversation[];
  selected: string | null;
  onSelect: (jid: string) => void;
}

export default function Sidebar({ conversations, selected, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>NanoClaw</h1>
      </div>
      <div className="sidebar-list">
        {conversations.map((c) => (
          <button
            key={c.jid}
            className={`sidebar-item ${c.jid === selected ? 'active' : ''}`}
            onClick={() => onSelect(c.jid)}
          >
            <span className={`channel-badge ${c.channel}`}>
              {CHANNEL_ICONS[c.channel] || '??'}
            </span>
            <div className="sidebar-item-text">
              <span className="sidebar-item-name">{c.name}</span>
              <span className="sidebar-item-time">
                {c.lastActivity ? new Date(c.lastActivity).toLocaleDateString() : ''}
              </span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
