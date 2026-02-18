import { useState, useRef, useEffect } from 'react';
import type { Conversation } from '../types';
import './Sidebar.css';

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: 'WA',
  slack: 'SL',
  web: 'WB',
  terminal: 'TM',
};

const CHANNEL_FILTERS = ['All', 'WA', 'SL', 'WB', 'TM'] as const;
const FILTER_TO_CHANNEL: Record<string, string> = { WA: 'whatsapp', SL: 'slack', WB: 'web', TM: 'terminal' };

interface Props {
  conversations: Conversation[];
  selected: string | null;
  onSelect: (jid: string) => void;
  onNewChat?: () => void;
  onRename?: (jid: string, name: string) => void;
  onArchive?: (jid: string) => void;
  onDelete?: (jid: string) => void;
  showArchived?: boolean;
  onToggleArchived?: () => void;
}

export default function Sidebar({
  conversations, selected, onSelect,
  onNewChat, onRename, onArchive, onDelete,
  showArchived, onToggleArchived,
}: Props) {
  const [channelFilter, setChannelFilter] = useState('All');
  const [menuJid, setMenuJid] = useState<string | null>(null);
  const [renamingJid, setRenamingJid] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = channelFilter === 'All'
    ? conversations
    : conversations.filter((c) => c.channel === FILTER_TO_CHANNEL[channelFilter]);

  // Close context menu on outside click
  useEffect(() => {
    if (!menuJid) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuJid(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuJid]);

  const startRename = (jid: string, currentName: string) => {
    setMenuJid(null);
    setRenamingJid(jid);
    setRenameValue(currentName);
  };

  const commitRename = (jid: string) => {
    if (renameValue.trim() && onRename) {
      onRename(jid, renameValue.trim());
    }
    setRenamingJid(null);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        {onNewChat && (
          <div className="sidebar-actions">
            <button className="new-chat-btn" onClick={onNewChat}>+ New Chat</button>
          </div>
        )}
        <div className="channel-filters">
          {CHANNEL_FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-chip ${channelFilter === f ? 'active' : ''}`}
              onClick={() => setChannelFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="sidebar-list">
        {filtered.map((c) => (
          <button
            key={c.jid}
            className={`sidebar-item ${c.jid === selected ? 'active' : ''}`}
            onClick={() => onSelect(c.jid)}
          >
            <span className={`channel-badge ${c.channel}`}>
              {CHANNEL_ICONS[c.channel] || '??'}
            </span>
            <div className="sidebar-item-row">
              <div className="sidebar-item-text">
                {renamingJid === c.jid ? (
                  <input
                    className="rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(c.jid)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(c.jid);
                      if (e.key === 'Escape') setRenamingJid(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="sidebar-item-name">{c.display_name || c.name}</span>
                )}
                <span className="sidebar-item-time">
                  {c.lastActivity ? new Date(c.lastActivity).toLocaleDateString() : ''}
                </span>
              </div>
              {(onRename || onArchive || onDelete) && (
                <div style={{ position: 'relative' }}>
                  <span
                    className="kebab-btn"
                    onClick={(e) => { e.stopPropagation(); setMenuJid(menuJid === c.jid ? null : c.jid); }}
                  >
                    ⋮
                  </span>
                  {menuJid === c.jid && (
                    <div className="context-menu" ref={menuRef}>
                      {onRename && (
                        <button onClick={(e) => { e.stopPropagation(); startRename(c.jid, c.display_name || c.name); }}>
                          Rename
                        </button>
                      )}
                      {onArchive && (
                        <button onClick={(e) => { e.stopPropagation(); setMenuJid(null); onArchive(c.jid); }}>
                          Archive
                        </button>
                      )}
                      {onDelete && (
                        <button className="danger" onClick={(e) => {
                          e.stopPropagation();
                          setMenuJid(null);
                          if (confirm('Delete this chat and all messages?')) onDelete(c.jid);
                        }}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      {onToggleArchived && (
        <div className="sidebar-footer">
          <button className="archive-toggle" onClick={onToggleArchived}>
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
        </div>
      )}
    </aside>
  );
}
