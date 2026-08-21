import React, { useEffect, useState, useRef } from 'react';
import { MessageSquare, Send, Clock, Plus } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmt(ts) {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function Messages() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.getMessages().then(data => {
      setThreads(data);
      if (data.length > 0) setSelected(s => s || data[0].id);
    }).catch(e => setError(e.message || 'Failed to load messages.')).finally(() => setLoading(false));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [selected, threads]);

  // Opening an unread thread marks it read for the clinician.
  useEffect(() => {
    const t = threads.find(x => x.id === selected);
    if (t && !t.readByClinician) {
      api.markMessageRead(t.id).then(() => {
        setThreads(prev => prev.map(x => x.id === t.id ? { ...x, readByClinician: true } : x));
      }).catch(() => {});
    }
  }, [selected]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSendError('');
    setSending(true);
    try {
      const updated = await api.sendMessage({ threadId: selected, text: text.trim() });
      setThreads(prev => prev.map(t => t.id === selected ? updated : t));
      setText('');
    } catch (e) { setSendError(e.message || 'Failed to send message.'); }
    finally { setSending(false); }
  }

  function onNewThread(created) {
    setThreads(prev => [created, ...prev]);
    setSelected(created.id);
    setShowNew(false);
  }

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading messages…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const activeThread = threads.find(t => t.id === selected);
  const msgs = activeThread?.thread || [];

  return (
    <div>
      <div className="page-header">
        <div><h2>Messages</h2><p>Secure messages with your patients</p></div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={15} /> New message</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 210px)', minHeight: 400 }}>
        <div className="card" style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14 }}>
            Conversations
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {threads.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 16px' }}><p>No messages yet</p></div>
            ) : threads.map(t => (
              <div key={t.id} onClick={() => setSelected(t.id)} style={{
                padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                background: selected === t.id ? 'var(--teal-50)' : 'transparent',
                borderLeft: selected === t.id ? '3px solid var(--teal-700)' : '3px solid transparent',
                transition: 'all .15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontWeight: t.readByClinician ? 600 : 700, fontSize: 13.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div>
                  {!t.readByClinician && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal-500)', flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.patientName || 'Patient'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {t.thread?.length > 0 ? fmt(t.thread[t.thread.length - 1]?.at) : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeThread ? (
            <div className="empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={40} style={{ opacity: .2, marginBottom: 12 }} />
              <p>Select a conversation</p>
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15 }}>
                {activeThread.subject}
                <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>with {activeThread.patientName || 'Patient'}</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {msgs.map((m, i) => {
                  const isMe = m.from === 'clinician';
                  return (
                    <div key={i} className={`msg-bubble ${isMe ? 'outgoing' : ''}`}>
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                        {isMe ? (user?.name?.[0] || 'D') : (activeThread.patientName?.[0] || 'P')}
                      </div>
                      <div>
                        <div className="msg-content">{m.text}</div>
                        <div className="msg-meta">{isMe ? 'You' : (activeThread.patientName || 'Patient')} · {fmt(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
                {msgs.length === 0 && <div className="empty-state" style={{ flex: 1 }}><p>No messages in this thread yet</p></div>}
                <div ref={bottomRef} />
              </div>
              {sendError && <div className="alert alert-error" style={{ margin: '0 16px' }}>{sendError}</div>}
              <form onSubmit={send} style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a reply…"
                  style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-body)', fontSize: 13.5, outline: 'none' }} />
                <button type="submit" className="btn btn-primary" aria-label="Send message" disabled={sending || !text.trim()}><Send size={15} /></button>
              </form>
            </>
          )}
        </div>
      </div>

      {showNew && <NewThreadModal clinicianId={user?.clinicianId} onClose={() => setShowNew(false)} onCreated={onNewThread} />}
    </div>
  );
}

function NewThreadModal({ clinicianId, onClose, onCreated }) {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPatients().then(setPatients).catch(e => setError(e.message || 'Failed to load patients.'));
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!patientId || !text.trim()) return;
    setError('');
    setSaving(true);
    try {
      const created = await api.sendMessage({
        patientId,
        clinicianId,
        subject: subject.trim() || 'Message',
        text: text.trim(),
      });
      onCreated(created);
    } catch (e) { setError(e.message || 'Failed to start conversation.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>New message</h3></div>
        <div className="modal-body">
          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
          <form id="new-thread-form" onSubmit={submit}>
            <div className="field">
              <label>Patient</label>
              <select value={patientId} onChange={e => setPatientId(e.target.value)} required>
                <option value="">Select a patient…</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}{p.mrn ? ` (${p.mrn})` : ''}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Lab results follow-up" maxLength={200} />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={4} required placeholder="Type your message…" />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="new-thread-form" className="btn btn-primary" disabled={saving || !patientId || !text.trim()}>
            <Send size={14} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
