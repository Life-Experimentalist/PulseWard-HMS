import React, { createContext, useContext, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, FileText, FlaskConical, Pill, MessageSquare, LogOut, PenLine, CalendarOff, ListTodo } from 'lucide-react';
import { getUser, api } from './api.js';
import Login from './pages/Login.jsx';
import Schedule from './pages/Schedule.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import NoteWriter from './pages/NoteWriter.jsx';
import Availability from './pages/Availability.jsx';
import Messages from './pages/Messages.jsx';
import Tasks from './pages/Tasks.jsx';

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

  const initials = user?.name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'D';

  const nav = [
    { to: '/',            icon: Calendar,      label: "Today's Schedule" },
    { to: '/patients',    icon: Users,         label: 'Patients' },
    { to: '/notes',       icon: PenLine,       label: 'Write Note' },
    { to: '/messages',    icon: MessageSquare, label: 'Messages' },
    { to: '/availability',icon: CalendarOff,   label: 'Availability' },
    { to: '/tasks',       icon: ListTodo,      label: 'My Tasks' },
  ];

  const titles = {
    '/': "Today's Schedule", '/patients': 'Patients', '/notes': 'Write Note',
    '/messages': 'Messages', '/availability': 'Availability', '/tasks': 'My Tasks',
  };
  const title = Object.entries(titles).find(([p]) => location.pathname === p)?.[1] ||
    (location.pathname.startsWith('/patients/') ? 'Patient Detail' : 'Clinician Portal');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">
            <div className="logo-mark">P</div>
            <div className="logo-text">PulseWard<span>Clinician Portal</span></div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Workflow</div>
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Icon size={16} />{label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{user?.name || 'Clinician'}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="nav-item" style={{ marginTop: 4 }} onClick={logout}><LogOut size={15} /> Sign out</button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar"><h1>{title}</h1></header>
        <main className="page-content">
          <Routes>
            <Route path="/"                element={<Schedule />} />
            <Route path="/patients"        element={<Patients />} />
            <Route path="/patients/:id"    element={<PatientDetail />} />
            <Route path="/notes"           element={<NoteWriter />} />
            <Route path="/messages"        element={<Messages />} />
            <Route path="/availability"    element={<Availability />} />
            <Route path="/tasks"           element={<Tasks />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
