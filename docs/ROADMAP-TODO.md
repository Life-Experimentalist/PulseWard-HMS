# PulseWard Roadmap and Todo Pipeline

## Phase A - Demo Readiness (Now)

- [ ] Confirm one-click demo boot works on fresh machine
- [ ] Validate all service ports and health endpoints
- [ ] Add minimal seed data for realistic walkthrough
- [ ] Capture short demo video/gif for portfolio
- [ ] Add screenshots to README
- [ ] Confirm issue automation workflows pass on first run

## Phase B - Product Foundation

- [ ] Standardize service runtime and TypeScript configuration
- [ ] Normalize API contracts and error models
- [ ] Add auth and role-based route protection checks
- [ ] Introduce CI quality gates per service
- [ ] Wire notification and appointment services to integration routing functions
- [ ] Implement admin APIs for provider config CRUD and test endpoints

## Phase C - UX and Brand

- [ ] Finalize logo and color system
- [ ] Unify typography and spacing tokens in UI kit
- [ ] Add onboarding and empty states in portals
- [ ] Improve mobile layouts for core views
- [ ] Implement admin panel tenant-branding CRUD wired to schema

## Phase D - Cloud Hardening

- [ ] Add managed database and backup policy
- [ ] Add centralized logs, alerts, and dashboards
- [ ] Define staged rollout and rollback playbooks
- [ ] Add release notes automation
- [ ] Verify weekly backup drill issue workflow and close with evidence

## Delivery Pipeline (Automated)

1. Developer pushes code
2. CI runs lint, test, build
3. Visuals workflow generates architecture SVG artifacts
4. Issue Ops workflow auto-labels, assigns, and posts SLA guidance
5. Weekly backup drill workflow opens operational verification issue
6. Label catalog workflow keeps triage/severity taxonomy consistent
7. Optional deploy workflow publishes demo environment
8. PR template enforces safety/privacy/rollback checklist
9. Integration config workflow validates tenant provider config on PR and push
