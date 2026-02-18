import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../types';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isBot = message.is_bot_message;
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`message ${isBot ? 'bot' : 'user'}`}>
      <div className="message-header">
        <span className="message-sender">{message.sender_name}</span>
        <span className="message-time">{time}</span>
      </div>
      <div className="message-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
      {!isBot && message.status && (
        <span className="message-status">
          {message.status === 'sending' ? '○' : '✓'}
        </span>
      )}
    </div>
  );
}
