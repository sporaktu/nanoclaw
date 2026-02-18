import { useState, useEffect, useCallback } from 'react';
import type { ScheduledTask, TaskRunLog } from '../types';

export function useTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createTask = useCallback(async (task: Partial<ScheduledTask>) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
    if (!res.ok) throw new Error(await res.text());
    await refresh();
    return res.json();
  }, [refresh]);

  const updateTask = useCallback(async (id: string, updates: Partial<ScheduledTask>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(await res.text());
    await refresh();
  }, [refresh]);

  const deleteTask = useCallback(async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    await refresh();
  }, [refresh]);

  const getRunLogs = useCallback(async (id: string): Promise<TaskRunLog[]> => {
    const res = await fetch(`/api/tasks/${id}/runs`);
    return res.json();
  }, []);

  return { tasks, loading, refresh, createTask, updateTask, deleteTask, getRunLogs };
}
