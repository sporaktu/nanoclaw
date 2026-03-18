import './NavBar.css';

export type Tab = 'chats' | 'tasks' | 'skills' | 'system';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chats', label: 'Chats' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'skills', label: 'Skills' },
  { id: 'system', label: 'System' },
];

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  connected: boolean;
}

export default function NavBar({ activeTab, onTabChange, connected }: Props) {
  return (
    <nav className="navbar">
      <span className="navbar-brand">NanoClaw</span>
      <div className="navbar-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`navbar-tab ${t.id === activeTab ? 'active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="navbar-spacer" />
      <div className={`navbar-status ${connected ? 'connected' : ''}`} title={connected ? 'Connected' : 'Disconnected'} />
    </nav>
  );
}
