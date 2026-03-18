import { useState, useEffect, useCallback } from 'react';
import { useTasks } from '../hooks/useTasks';
import { useWebSocket } from '../hooks/useWebSocket';
import type { ScheduledTask, TaskRunLog, WsMessage } from '../types';
import './TasksTab.css';

type StatusFilter = 'all' | 'active' | 'paused' | 'completed';

function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface TaskDetailProps {
  task: ScheduledTask;
  getRunLogs: (id: string) => Promise<TaskRunLog[]>;
}

function TaskDetail({ task, getRunLogs }: TaskDetailProps) {
  const [runs, setRuns] = useState<TaskRunLog[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  useEffect(() => {
    setLoadingRuns(true);
    getRunLogs(task.id)
      .then(setRuns)
      .catch(console.error)
      .finally(() => setLoadingRuns(false));
  }, [task.id, getRunLogs]);

  return (
    <div className="task-detail">
      <h3>{task.group_folder}</h3>
      <div className="task-detail-grid">
        <span className="task-detail-label">Status</span>
        <span className="task-detail-value">{task.status}</span>
        <span className="task-detail-label">Schedule</span>
        <span className="task-detail-value">{task.schedule_type}: {task.schedule_value}</span>
        <span className="task-detail-label">Context</span>
        <span className="task-detail-value">{task.context_mode}</span>
        <span className="task-detail-label">Next run</span>
        <span className="task-detail-value">{formatDate(task.next_run)}</span>
        <span className="task-detail-label">Last run</span>
        <span className="task-detail-value">{formatDate(task.last_run)}</span>
        <span className="task-detail-label">Created</span>
        <span className="task-detail-value">{formatDate(task.created_at)}</span>
      </div>

      <div className="task-prompt-full">{task.prompt}</div>

      {task.last_result && (
        <div style={{ marginBottom: 24 }}>
          <div className="task-detail-label" style={{ marginBottom: 8 }}>Last result</div>
          <div className="task-prompt-full">{task.last_result}</div>
        </div>
      )}

      <div className="run-history">
        <h4>Run History</h4>
        {loadingRuns ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</p>
        ) : runs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No runs yet</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{formatDate(run.run_at)}</td>
                  <td>{formatDuration(run.duration_ms)}</td>
                  <td style={{ color: run.error ? 'var(--danger)' : 'var(--success)' }}>
                    {run.error ? 'error' : 'ok'}
                  </td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.error ?? run.result ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function TasksTab() {
  const { tasks, loading, refresh, getRunLogs } = useTasks();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'taskUpdate' || msg.type === 'taskRun') {
      refresh();
    }
  }, [refresh]);

  useWebSocket(handleWsMessage);

  const filtered = statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter);
  const selectedTask = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="tasks-tab">
      <div className="tasks-list-panel">
        <div className="tasks-list-header">
          <div className="tasks-filter-chips">
            {(['all', 'active', 'paused', 'completed'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                className={`filter-chip ${s === statusFilter ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="tasks-list-items">
          {loading && filtered.length === 0 ? (
            <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No tasks
            </div>
          ) : (
            filtered.map((task) => (
              <button
                key={task.id}
                className={`task-item ${task.id === selectedTask?.id ? 'active' : ''}`}
                onClick={() => setSelectedId(task.id)}
              >
                <div className={`status-dot ${task.status}`} />
                <div className="task-item-text">
                  <span className="task-item-prompt">{task.prompt}</span>
                  <span className="task-item-meta">
                    {task.group_folder} · {task.schedule_type} · next {formatDate(task.next_run)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="tasks-detail-panel">
        {selectedTask ? (
          <TaskDetail task={selectedTask} getRunLogs={getRunLogs} />
        ) : (
          <div className="tasks-placeholder">Select a task to view details</div>
        )}
      </div>
    </div>
  );
}
