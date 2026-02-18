export interface Conversation {
  jid: string;
  name: string;
  folder: string;
  channel: 'whatsapp' | 'slack' | 'web' | 'terminal';
  lastActivity: string;
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

export interface WsMessage {
  type: 'newMessage' | 'typing';
  message?: Message;
  jid?: string;
  value?: boolean;
}
