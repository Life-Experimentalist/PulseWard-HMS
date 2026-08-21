import React, { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, LogOut } from 'lucide-react';
import { getUser, api } from './api.js';
import Login from './pages/Login.jsx';
import Health from './pages/Health.jsx';
import Incidents from './pages/Incidents.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(() => getUser());
  const login = (u) => setUser(u);
  const logout = async () => { await api.logout(); setUser(null); };

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
          <Route path="/*" element={user ? <Shell /> : <Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setLastRefresh(new Date());
      setTick(x => x + 1);
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const titles = { '/': 'Platform Health', '/incidents': 'Incidents' };
  const title = titles[location.pathname] || 'Operations';
  const initials = user?.name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'OP';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">
            <div className="logo-mark">⬡</div>
            <div className="logo-text">PulseWard<span>Operations Dashboard</span></div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Activity size={15} /> Platform Health
          </NavLink>
          <NavLink to="/incidents" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <AlertTriangle size={15} /> Incidents
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="ops-user">
            <div className="ops-avatar">{initials}</div>
            <div className="ops-user-info">
              <div className="ops-user-name">{user?.name || 'Operator'}</div>
              <div className="ops-user-role">{user?.role || 'ops'}</div>
            </div>
          </div>
          <button className="nav-item" style={{ marginTop: 4 }} onClick={logout}>
            <LogOut size={15} /> Sign out
          </button>
          <div style={{ marginTop: 8, opacity: .55 }}>Auto-refresh: 30s</div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="live-badge">
            <span className="live-dot" />
            LIVE
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </span>
        </header>
        <main className="page-content">
          <Routes>
            {/* refreshTick re-fetches data in place — remounting via key would
                close open modals and drop half-typed forms every 30s */}
            <Route path="/"          element={<Health refreshTick={tick} />} />
            <Route path="/incidents" element={<Incidents refreshTick={tick} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
