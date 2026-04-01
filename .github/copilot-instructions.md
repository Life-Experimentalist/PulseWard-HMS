# PulseWard Copilot Instructions

These instructions guide all AI-assisted work in this repository.

## Mission

Deliver safe, modular, cost-aware, production-ready outcomes for PulseWard HMS.

## Critical Rules

- Protect patient privacy and confidentiality in all code, logs, and examples.
- Keep APIs and event schemas aligned with documented contracts.
- Ensure behavior is configurable for admins where feasible.
- Prefer low-cost and low-operations defaults.
- Keep third-party provider logic behind adapter interfaces.

## Architecture Expectations

- Maintain service boundaries between gateway, domain services, and shared packages.
- Do not hardcode provider-specific behavior in core domain modules.
- Reuse shared error, event, and identifier schemas.
- Include migration and rollback notes for breaking changes.

## Engineering Process

- Work in small iterations with explicit assumptions.
- Include test strategy and operational impact for each significant change.
- Update relevant docs when architecture, API, or workflow behavior changes.
- Highlight risks and unresolved dependencies before merge.

## Review Priorities

1. Patient safety and privacy risk
2. Scheduling correctness and conflict handling
3. API contract compatibility
4. Configurability and module isolation
5. Cost and operational simplicity

## Required Delivery Signals

- Contracts validated
- Documentation updated
- Monitoring/alerting impact considered
- Rollback path described
