import { useState, useCallback, useEffect, useRef } from 'react';
import NavBar, { type Tab } from './components/NavBar';
import ChatsTab from './components/ChatsTab';
import TasksTab from './components/TasksTab';
import SkillsTab from './components/SkillsTab';
import SystemTab from './components/SystemTab';
import { useWebSocket } from './hooks/useWebSocket';
import type { Message, WsMessage } from './types';
import './App.css';

const VALID_TABS: Tab[] = ['chats', 'tasks', 'skills', 'system'];

function getInitialTab(): Tab {
  const hash = window.location.hash.replace('#', '') as Tab;
  return VALID_TABS.includes(hash) ? hash : 'chats';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab);
  const addMessageRef = useRef<((msg: Message) => void) | null>(null);
  const refreshChatsRef = useRef<(() => void) | null>(null);
  const refreshTasksRef = useRef<(() => void) | null>(null);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  }, []);

  // Browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '') as Tab;
      if (VALID_TABS.includes(hash)) setActiveTab(hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'newMessage' && msg.message) {
      addMessageRef.current?.(msg.message);
      refreshChatsRef.current?.();
    }
    if (msg.type === 'taskUpdate' || msg.type === 'taskRun') {
      refreshTasksRef.current?.();
    }
    if (msg.type === 'chatUpdate') {
      refreshChatsRef.current?.();
    }
  }, []);

  const { send, connected } = useWebSocket(handleWsMessage);

  return (
    <div className="app">
      <NavBar activeTab={activeTab} onTabChange={handleTabChange} connected={connected} />
      <div className="app-content">
        {activeTab === 'chats' && (
          <ChatsTab
            send={send}
            connected={connected}
            addMessageRef={addMessageRef}
            refreshRef={refreshChatsRef}
          />
        )}
        {activeTab === 'tasks' && <TasksTab refreshRef={refreshTasksRef} />}
        {activeTab === 'skills' && <SkillsTab />}
        {activeTab === 'system' && <SystemTab />}
      </div>
    </div>
  );
}
