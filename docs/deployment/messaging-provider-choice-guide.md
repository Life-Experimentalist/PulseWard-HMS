# Messaging Provider Choice Guide

## Quick recommendation

Use a hybrid default:

1. Telegram Bot for instant interactive alerts.
2. SMTP Email as reliability fallback and formal communication channel.
3. Optional paid WhatsApp for high-engagement patient messaging when each hospital admin is ready to onboard and pay.

## Cost model summary

- Telegram Bot: free to start.
- SMTP Email: free if hospital has existing mail relay or low-cost provider.
- Generic Webhook: free for internal systems.
- WhatsApp Cloud API: paid model in most production use cases; billing and sender setup by each hospital admin.

## When to prefer Telegram

- Fast staff notifications.
- Bot-style workflows.
- Low setup cost.

## When to prefer Email

- Appointment summaries and formal notices.
- Universal recipient reach.
- Audit-friendly message archive.

## When to enable WhatsApp

- Patient engagement and reminders where read rates matter.
- Hospital admin agrees to own billing and template approvals.

## Default policy implemented in this release

- Patient notifications: Telegram first, Email/Webhook fallback, WhatsApp optional fallback.
- Staff notifications: Email first, Telegram fallback.
- Website events: Webhook first.
