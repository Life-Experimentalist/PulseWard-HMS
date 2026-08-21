import React, { createContext, useContext, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Stethoscope, ScrollText, Building2, Inbox, LogOut } from 'lucide-react';
import { getUser, api } from './api.js';
import Login from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import UserManagement from './pages/UserManagement.jsx';
import Clinicians from './pages/Clinicians.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Reassignments from './pages/Reassignments.jsx';
import Tenants from './pages/Tenants.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(() => getUser());
  const login = u => setUser(u);
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
  const initials = user?.name?.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase() || 'A';

  const nav = [
    { to: '/',              icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users',         icon: Users,           label: 'Users' },
    { to: '/clinicians',    icon: Stethoscope,     label: 'Clinicians' },
    { to: '/reassignments', icon: Inbox,           label: 'Reassignments' },
    { to: '/tenants',       icon: Building2,       label: 'Tenants' },
    { to: '/audit',         icon: ScrollText,      label: 'Audit Log' },
  ];

  const titles = { '/': 'Dashboard', '/users': 'User Management', '/clinicians': 'Clinicians', '/reassignments': 'Reassignment Queue', '/tenants': 'Tenants', '/audit': 'Audit Log' };
  const title = titles[location.pathname] || 'Admin Console';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">
            <div className="logo-mark">A</div>
            <div className="logo-text">PulseWard<span>Admin Console</span></div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Administration</div>
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to==='/'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Icon size={16} />{label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.name || 'Admin'}</div>
              <div className="user-role">Administrator</div>
            </div>
          </div>
          <button className="nav-item" style={{ marginTop: 4 }} onClick={logout}><LogOut size={15} />Sign out</button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar"><h1>{title}</h1></header>
        <main className="page-content">
          <Routes>
            <Route path="/"              element={<AdminDashboard />} />
            <Route path="/users"         element={<UserManagement />} />
            <Route path="/clinicians"    element={<Clinicians />} />
            <Route path="/reassignments" element={<Reassignments />} />
            <Route path="/tenants"       element={<Tenants />} />
            <Route path="/audit"         element={<AuditLog />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
