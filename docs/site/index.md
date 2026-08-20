---
layout: home

hero:
  name: PulseWard HMS
  text: Modern Hospital Management
  tagline: Open-source · Self-hostable · Multi-tenant. Deploy to any hospital in under five minutes.
  image:
    src: /logo.svg
    alt: PulseWard HMS
  actions:
    - theme: brand
      text: Quick Deploy
      link: /deploy
    - theme: alt
      text: Architecture
      link: /architecture/

features:
  - icon: 🧑‍⚕️
    title: Patient Portal
    details: Self-registration with auto-assigned MRN, appointment scheduling, lab results, secure messaging, and notification inbox.
  - icon: 📋
    title: Clinician Portal
    details: Daily schedule view, full patient chart with SOAP notes, lab ordering, prescriptions, and digital signing.
  - icon: 🛡️
    title: Admin Console
    details: User and clinician management, role assignment, full audit trail with actor/IP tracking, and stats dashboard.
  - icon: 📊
    title: Ops Dashboard
    details: Service and database health checks, per-component latency and uptime, platform metrics (users, appointments), and an incident feed.
  - icon: 🔐
    title: Secure by Design
    details: JWT with 15-min access + 30-day rotating refresh tokens. bcrypt passwords. Row-level tenant isolation.
  - icon: 📦
    title: Zero External DB
    details: Node 24 built-in SQLite with WAL mode. No Postgres, no MongoDB, no connection pool to manage.
---
