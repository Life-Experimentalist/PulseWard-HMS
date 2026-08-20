import React, { useEffect, useState, useRef } from 'react';
import { MessageSquare, Send, Clock } from 'lucide-react';
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
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!user?.patientId) return;
    api.getMessages(user.patientId).then(data => {
      setThreads(data);
      if (data.length > 0 && !selected) setSelected(data[0].id);
    }).catch(e => setError(e.message || 'Failed to load messages.')).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [selected, threads]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSendError('');
    setSending(true);
    try {
      const updated = await api.sendMessage({
        patientId: user.patientId,
        threadId: selected,
        body: text.trim(),
        subject: threads.find(t => t.id === selected)?.subject || 'Message',
      });
      setThreads(prev => prev.map(t => t.id === selected ? updated : t));
      setText('');
    } catch (e) { setSendError(e.message || 'Failed to send message.'); }
    finally { setSending(false); }
  }

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading messages…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const activeThread = threads.find(t => t.id === selected);
  const msgs = activeThread?.thread || [];

  return (
    <div>
      <div className="page-header">
        <div><h2>Messages</h2><p>Secure messages with your care team</p></div>
      </div>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 200px)', minHeight: 400 }}>
        <div className="card" style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 2 }}>{t.subject}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.clinicianName || 'Care Team'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {t.thread?.length > 0 ? fmt(t.thread[t.thread.length-1]?.at) : ''}
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
                <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>with {activeThread.clinicianName || 'Care Team'}</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {msgs.map((m, i) => {
                  const isMe = m.from === 'patient';
                  return (
                    <div key={i} className={`msg-bubble ${isMe ? 'outgoing' : ''}`}>
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                        {isMe ? (user?.name?.[0] || 'P') : 'D'}
                      </div>
                      <div>
                        <div className="msg-content">{m.text}</div>
                        <div className="msg-meta">{isMe ? 'You' : (activeThread.clinicianName || 'Care Team')} · {fmt(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
                {msgs.length === 0 && <div className="empty-state" style={{ flex: 1 }}><p>No messages in this thread yet</p></div>}
                <div ref={bottomRef} />
              </div>
              {sendError && <div className="alert alert-error" style={{ margin: '0 16px' }}>{sendError}</div>}
              <form onSubmit={send} style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message…"
                  style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-body)', fontSize: 13.5, outline: 'none' }} />
                <button type="submit" className="btn btn-primary" aria-label="Send message" disabled={sending || !text.trim()}><Send size={15} /></button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
