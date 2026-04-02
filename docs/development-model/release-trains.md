# PulseWard Release Trains

## Scope

PulseWard uses milestone-driven release trains aligned to `docs/ROADMAP-TODO.md`.

## Train Cadence

- Roadmap window: 20-28 weeks across M0 to M9.
- Operational cadence: weekly integration checkpoints and milestone-bound release notes.
- Contract parity checks run continuously in CI, not only at release time.

## Train Structure

For each active milestone:

1. Slice planning and assumptions recorded.
2. Implementation in small, verifiable commits.
3. Tests and contract checks enforced.
4. Docs updated in same milestone slice.
5. Milestone summary committed and tagged where applicable.

## Commit and Tagging Policy

- Keep commits scoped to one logical slice (for example: M1 parity, M2 auth settings seed, M5 provider checks).
- Use milestone-oriented commit messages:
  - `feat(m1): ...`
  - `test(m1): ...`
  - `docs(m5): ...`
- Tag major milestone checkpoints.
  Existing examples:
  - `m1.2-contract-parity`
  - `m1.3-drift-reconciliation`
  - `m1.4-strict-ci-parity`
  - `m1.5-parity-regression-tests`

## Entry Criteria for a Milestone Slice

- Contract and dependency impact is understood.
- Affected service and adapter boundaries are identified.
- Validation plan is defined before coding.

## Exit Criteria for a Milestone Slice

- Feature works across service boundaries.
- Required quality gates pass.
- API/runbook/release docs are updated.
- Rollback path is documented when behavior changed.

## Roles

- Product and architecture owner: approves scope and policy decisions.
- Service owners: implement and validate runtime behavior.
- Operations owner: validates runbooks, smoke readiness, and rollback safety.
- AI delivery agent: accelerates implementation while preserving contracts and documentation parity.
