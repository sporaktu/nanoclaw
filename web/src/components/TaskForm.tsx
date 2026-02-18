import { useState } from 'react';
import type { ScheduledTask } from '../types';

interface Props {
  groups: string[];
  onSubmit: (task: Partial<ScheduledTask>) => void;
  onCancel: () => void;
}

export default function TaskForm({ groups, onSubmit, onCancel }: Props) {
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval' | 'once'>('cron');
  const [scheduleValue, setScheduleValue] = useState('');
  const [group, setGroup] = useState(groups[0] || '');
  const [contextMode, setContextMode] = useState<'isolated' | 'group'>('isolated');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      prompt,
      schedule_type: scheduleType,
      schedule_value: scheduleValue,
      group_folder: group,
      context_mode: contextMode,
    });
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <h3>New Task</h3>
      <label>
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          required
          placeholder="What should the agent do?"
        />
      </label>
      <label>
        Schedule Type
        <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as typeof scheduleType)}>
          <option value="cron">Cron</option>
          <option value="interval">Interval</option>
          <option value="once">Once</option>
        </select>
      </label>
      <label>
        Schedule Value
        <input
          value={scheduleValue}
          onChange={(e) => setScheduleValue(e.target.value)}
          required
          placeholder={scheduleType === 'cron' ? '0 9 * * *' : scheduleType === 'interval' ? '30m' : '2025-12-31T09:00'}
        />
      </label>
      <label>
        Group
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      <label>
        Context Mode
        <select value={contextMode} onChange={(e) => setContextMode(e.target.value as typeof contextMode)}>
          <option value="isolated">Isolated</option>
          <option value="group">Group</option>
        </select>
      </label>
      <div className="task-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">Create Task</button>
      </div>
    </form>
  );
}
