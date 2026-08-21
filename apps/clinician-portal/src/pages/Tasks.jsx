import React, { useEffect, useState } from 'react';
import { Clock, Plus, Trash2, Zap, CalendarClock, Users2, Ban } from 'lucide-react';
import { api } from '../api.js';

const QUADRANTS = [
  { key: 'do',        label: 'Do first',   sub: 'Urgent · important',       icon: Zap,           color: 'var(--error)' },
  { key: 'schedule',  label: 'Schedule',   sub: 'Not urgent · important',   icon: CalendarClock, color: 'var(--info)' },
  { key: 'delegate',  label: 'Delegate',   sub: 'Urgent · not important',   icon: Users2,        color: 'var(--warn)' },
  { key: 'eliminate', label: 'Eliminate',  sub: 'Not urgent · unimportant', icon: Ban,           color: 'var(--text-muted)' },
];

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [title, setTitle] = useState('');
  const [quadrant, setQuadrant] = useState('do');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.getTasks().then(setTasks)
      .catch(e => setError(e.message || 'Failed to load tasks.'))
      .finally(() => setLoading(false));
  }, []);

  async function addTask(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setActionError('');
    setAdding(true);
    try {
      const task = await api.createTask({ title: title.trim(), quadrant });
      setTasks(prev => [task, ...prev]);
      setTitle('');
    } catch (e2) { setActionError(e2.message || 'Failed to add task.'); }
    finally { setAdding(false); }
  }

  async function toggleDone(task) {
    setActionError('');
    try {
      const updated = await api.patchTask(task.id, { done: !task.done });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    } catch (e) { setActionError(e.message || 'Failed to update task.'); }
  }

  async function move(task, q) {
    setActionError('');
    try {
      const updated = await api.patchTask(task.id, { quadrant: q });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    } catch (e) { setActionError(e.message || 'Failed to move task.'); }
  }

  async function remove(task) {
    setActionError('');
    try {
      await api.deleteTask(task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (e) { setActionError(e.message || 'Failed to delete task.'); }
  }

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading tasks…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const open = tasks.filter(t => !t.done).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>My Tasks</h2>
          <p>{open === 0 ? 'All clear — nothing pending' : `${open} open task${open > 1 ? 's' : ''}`} · prioritised the Eisenhower way</p>
        </div>
      </div>

      {actionError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{actionError}</div>}

      <form onSubmit={addTask} className="card" style={{ display: 'flex', gap: 10, padding: 14, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={title} onChange={e => setTitle(e.target.value)} maxLength={300}
          placeholder="Add a task — e.g. Review Mr. Rao's lab panel"
          style={{ flex: 1, minWidth: 220, padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-body)', fontSize: 13.5, outline: 'none' }}
        />
        <select value={quadrant} onChange={e => setQuadrant(e.target.value)}
          style={{ padding: '9px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--surface)' }}>
          {QUADRANTS.map(q => <option key={q.key} value={q.key}>{q.label}</option>)}
        </select>
        <button type="submit" className="btn btn-primary" disabled={adding || !title.trim()}><Plus size={15} /> Add</button>
      </form>

      <div className="task-board">
        {QUADRANTS.map(({ key, label, sub, icon: Icon, color }) => {
          const items = tasks.filter(t => t.quadrant === key);
          return (
            <div key={key} className="task-quadrant">
              <div className="task-quadrant-header">
                <Icon size={15} style={{ color }} />
                <span>{label}</span>
                <span className="text-muted" style={{ fontWeight: 400, fontSize: 11.5, marginLeft: 'auto' }}>{sub}</span>
              </div>
              {items.length === 0 ? (
                <div className="empty-state" style={{ padding: '26px 14px' }}><p style={{ fontSize: 12.5 }}>Nothing here</p></div>
              ) : items.map(t => (
                <div key={t.id} className={`task-row${t.done ? ' done' : ''}`}>
                  <input type="checkbox" checked={t.done} onChange={() => toggleDone(t)} aria-label={t.done ? 'Mark as not done' : 'Mark as done'} />
                  <span className="task-title">{t.title}</span>
                  <select value={t.quadrant} onChange={e => move(t, e.target.value)} aria-label="Move to quadrant">
                    {QUADRANTS.map(q => <option key={q.key} value={q.key}>{q.label}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(t)} aria-label="Delete task" style={{ padding: '3px 6px' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
