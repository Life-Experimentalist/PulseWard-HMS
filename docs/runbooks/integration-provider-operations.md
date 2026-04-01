# Integration Provider Operations Runbook

## Daily checks

- Verify active provider list for each tenant.
- Verify no provider marked enabled without credentials reference.
- Verify fallback providers are configured.

## Weekly checks

- Trigger messaging test for each enabled messaging provider.
- Trigger calendar booking test for each enabled calendar provider.
- Record results in operations issues.

## Incident handling

1. Identify failing provider.
2. Switch default to configured fallback provider.
3. Re-run provider test endpoint.
4. Open incident issue if fallback also fails.
5. Keep audit trail of provider routing changes.

## Change management

- Never delete previous config versions.
- Use pull requests for config updates.
- Require rollback notes in PR template.
