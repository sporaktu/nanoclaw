export interface Conversation {
  jid: string;
  name: string;
  display_name: string | null;
  folder: string;
  channel: 'whatsapp' | 'slack' | 'web' | 'terminal';
  lastActivity: string;
  archived: number;
}

export interface Message {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean | number;
  is_bot_message?: boolean | number;
}

export interface ScheduledTask {
  id: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  group_folder: string;
  context_mode: 'isolated' | 'group';
  status: 'active' | 'paused' | 'completed';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  created_at: string;
}

export interface TaskRunLog {
  id: string;
  task_id: string;
  run_at: string;
  duration_ms: number;
  result: string;
  error: string | null;
}

export interface Skill {
  name: string;
  description: string;
}

export interface SkillDetail {
  name: string;
  content: string;
  files: string[];
}

export interface SystemStatus {
  activeContainers: number;
  connectedClients: number;
  uptime: number;
  groups: RegisteredGroupInfo[];
  sessions: Record<string, string>;
}

export interface RegisteredGroupInfo {
  name: string;
  folder: string;
  trigger: string;
  channel: string;
}

export interface WsMessage {
  type: 'newMessage' | 'typing' | 'taskUpdate' | 'taskRun' | 'chatUpdate';
  message?: Message;
  jid?: string;
  value?: boolean;
  task?: ScheduledTask;
  taskRun?: TaskRunLog;
}
