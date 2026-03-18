import { useState, useCallback } from 'react';
import NavBar, { Tab } from './components/NavBar';
import ChatsTab from './components/ChatsTab';
import TasksTab from './components/TasksTab';
import SkillsTab from './components/SkillsTab';
import SystemTab from './components/SystemTab';
import { useWebSocket } from './hooks/useWebSocket';
import { useConversations } from './hooks/useConversations';
import type { WsMessage } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chats');
  const { conversations, loading: convsLoading, refresh: refreshConvs, showArchived, setShowArchived } = useConversations();

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'newMessage' || msg.type === 'chatUpdate') {
      refreshConvs();
    }
  }, [refreshConvs]);

  const { connected } = useWebSocket(handleWsMessage);

  return (
    <div className="app">
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} connected={connected} />
      <div className="app-content">
        {activeTab === 'chats' && (
          <ChatsTab
            conversations={conversations}
            loading={convsLoading}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived((v) => !v)}
          />
        )}
        {activeTab === 'tasks' && <TasksTab />}
        {activeTab === 'skills' && <SkillsTab />}
        {activeTab === 'system' && <SystemTab />}
      </div>
    </div>
  );
}
