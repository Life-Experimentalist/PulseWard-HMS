import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, FileText, FlaskConical, Pill, MessageSquare, Bell, LogOut, ChevronRight, User } from 'lucide-react';
import { getUser, api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Appointments from './pages/Appointments.jsx';
import Records from './pages/Records.jsx';
import Labs from './pages/Labs.jsx';
import Prescriptions from './pages/Prescriptions.jsx';
import Messages from './pages/Messages.jsx';
import Notifications from './pages/Notifications.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(() => getUser());
  const [notifCount, setNotifCount] = useState(0);

  const login = (u) => { setUser(u); };
  const logout = async () => { await api.logout(); setUser(null); };

  return (
    <AuthCtx.Provider value={{ user, login, logout, notifCount, setNotifCount }}>
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
  const { user, logout, notifCount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const initials = user?.name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'P';

  const nav = [
    { to: '/',             icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/appointments', icon: Calendar,        label: 'Appointments' },
    { to: '/records',      icon: FileText,        label: 'Health Records' },
    { to: '/labs',         icon: FlaskConical,    label: 'Lab Results' },
    { to: '/prescriptions',icon: Pill,            label: 'Prescriptions' },
    { to: '/messages',     icon: MessageSquare,   label: 'Messages' },
    { to: '/notifications',icon: Bell,            label: 'Notifications', badge: notifCount },
  ];

  const pageTitles = {
    '/':              'Dashboard',
    '/appointments':  'Appointments',
    '/records':       'Health Records',
    '/labs':          'Lab Results',
    '/prescriptions': 'Prescriptions',
    '/messages':      'Messages',
    '/notifications': 'Notifications',
  };
  const title = pageTitles[location.pathname] || 'Patient Portal';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">
            <div className="logo-mark">P</div>
            <div className="logo-text">PulseWard<span>Patient Portal</span></div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">My Care</div>
          {nav.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            >
              <Icon size={16} />
              {label}
              {badge > 0 && <span className="nav-badge">{badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip" onClick={() => {}}>
            <div className="avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{user?.name || 'Patient'}</div>
              <div className="user-role">Patient</div>
            </div>
          </div>
          <button className="nav-item" style={{ marginTop: 4 }} onClick={logout}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="topbar-actions">
            <button className="btn-icon" onClick={() => navigate('/notifications')}>
              <Bell size={18} />
              {notifCount > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: 'var(--error)', borderRadius: '50%' }} />
              )}
            </button>
          </div>
        </header>
        <main className="page-content">
          <Routes>
            <Route path="/"              element={<Dashboard />} />
            <Route path="/appointments"  element={<Appointments />} />
            <Route path="/records"       element={<Records />} />
            <Route path="/labs"          element={<Labs />} />
            <Route path="/prescriptions" element={<Prescriptions />} />
            <Route path="/messages"      element={<Messages />} />
            <Route path="/notifications" element={<Notifications />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
