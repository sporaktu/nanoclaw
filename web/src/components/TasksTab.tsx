import { useState, useEffect, type MutableRefObject } from 'react';
import TaskForm from './TaskForm';
import { useTasks } from '../hooks/useTasks';
import { useSystem } from '../hooks/useSystem';
import type { ScheduledTask, TaskRunLog } from '../types';
import './TasksTab.css';

type Filter = 'all' | 'active' | 'paused' | 'completed';

interface Props {
  refreshRef: MutableRefObject<(() => void) | null>;
}

export default function TasksTab({ refreshRef }: Props) {
  const { tasks, refresh, createTask, updateTask, deleteTask, getRunLogs } = useTasks();
  const { groups } = useSystem();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [runLogs, setRunLogs] = useState<TaskRunLog[]>([]);

  useEffect(() => { refreshRef.current = refresh; }, [refresh, refreshRef]);

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
  const selected = tasks.find((t) => t.id === selectedId);

  useEffect(() => {
    if (selectedId) {
      getRunLogs(selectedId).then(setRunLogs).catch(() => setRunLogs([]));
    }
  }, [selectedId, getRunLogs]);

  const handleCreate = async (task: Partial<ScheduledTask>) => {
    await createTask(task);
    setShowForm(false);
  };

  const handleTogglePause = async (task: ScheduledTask) => {
    await updateTask(task.id, { status: task.status === 'active' ? 'paused' : 'active' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    await deleteTask(id);
    setSelectedId(null);
  };

  const groupFolders = groups.map((g) => g.folder);

  return (
    <div className="tasks-tab">
      <div className="tasks-list-panel">
        <div className="tasks-list-header">
          <button className="new-task-btn" onClick={() => { setShowForm(true); setSelectedId(null); }}>
            + New Task
          </button>
          <div className="tasks-filter-chips">
            {(['all', 'active', 'paused', 'completed'] as Filter[]).map((f) => (
              <button
                key={f}
                className={`filter-chip ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="tasks-list-items">
          {filtered.map((t) => (
            <button
              key={t.id}
              className={`task-item ${t.id === selectedId ? 'active' : ''}`}
              onClick={() => { setSelectedId(t.id); setShowForm(false); }}
            >
              <span className={`status-dot ${t.status}`} />
              <div className="task-item-text">
                <span className="task-item-prompt">{t.prompt}</span>
                <span className="task-item-meta">
                  {t.schedule_type}: {t.schedule_value} · {t.group_folder}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="tasks-detail-panel">
        {showForm ? (
          <TaskForm
            groups={groupFolders}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        ) : selected ? (
          <div className="task-detail">
            <h3>Task Detail</h3>
            <div className="task-prompt-full">{selected.prompt}</div>
            <div className="task-detail-grid">
              <span className="task-detail-label">Status</span>
              <span className="task-detail-value">{selected.status}</span>
              <span className="task-detail-label">Schedule</span>
              <span className="task-detail-value">{selected.schedule_type}: {selected.schedule_value}</span>
              <span className="task-detail-label">Group</span>
              <span className="task-detail-value">{selected.group_folder}</span>
              <span className="task-detail-label">Context</span>
              <span className="task-detail-value">{selected.context_mode}</span>
              <span className="task-detail-label">Next Run</span>
              <span className="task-detail-value">{selected.next_run ? new Date(selected.next_run).toLocaleString() : '—'}</span>
              <span className="task-detail-label">Last Run</span>
              <span className="task-detail-value">{selected.last_run ? new Date(selected.last_run).toLocaleString() : '—'}</span>
              <span className="task-detail-label">Last Result</span>
              <span className="task-detail-value">{selected.last_result || '—'}</span>
            </div>
            <div className="task-actions">
              <button className="btn-primary" onClick={() => handleTogglePause(selected)}>
                {selected.status === 'active' ? 'Pause' : 'Resume'}
              </button>
              <button className="btn-danger" onClick={() => handleDelete(selected.id)}>
                Delete
              </button>
            </div>
            {runLogs.length > 0 && (
              <div className="run-history">
                <h4>Run History</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Duration</th>
                      <th>Result</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runLogs.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.run_at).toLocaleString()}</td>
                        <td>{(r.duration_ms / 1000).toFixed(1)}s</td>
                        <td>{r.result}</td>
                        <td style={{ color: r.error ? 'var(--danger)' : undefined }}>{r.error || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="tasks-placeholder">Select a task or create a new one</div>
        )}
      </div>
    </div>
  );
}
