import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a2330', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 40, maxWidth: 480 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚕</div>
          <h2 style={{ margin: '0 0 8px', color: '#e2e8f0' }}>Something went wrong</h2>
          <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', background: '#0f4c5c', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
