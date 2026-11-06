# API coverage and promotion gates

Contract snapshot: 2026-11-06, from the Platform API OpenAPI fragments on the Glean main branch. “Merged” describes reviewed source, **not** verified tenant deployment. Every operation is experimental and needs `X-Glean-Include-Experimental: true`. Requests authenticate with a user-scoped Client API token carrying the `PEOPLE` (people, departments) and `ADMIN_USAGE` (everything else) scopes.

| UI capability                          | REST operation / shape                                                                                              | Integration state                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| People, person picker, manager forest  | `GET /api/users?page_size=100&cursor=…`; `results[].user_id`, `email`, optional `department` and `manager`          | Merged; people load one page at a time                                       |
| Department directory filter            | `GET /api/departments`; `department_id`, `display_name`                                                             | Merged. A department ID derives from its name, so a rename changes the ID    |
| Spend-client picker                    | `GET /api/admin/oauth/clients?filters=[{"field":"has_ai_gateway","values":["true"]}]`; `ai_gateway.usage_client_id` | Merged. Enabled static clients only; `glean` is a constant; others are typed |
| Policy list                            | `GET /api/admin/usage/limits`; `results[]` of `{target, period, value?, allocation_mode?, actions?}`                | Merged; bounded full pagination                                              |
| Organization/default/user policy write | `POST /api/admin/usage/limits`; one `UsageLimit`, returns `usage_limit`                                             | Merged; live writes opt-in only                                              |
| Policy removal                         | `POST /api/admin/usage/limits/reset`; natural key `{target, period}`, returns `is_configuration_removed`            | Merged; live writes opt-in only                                              |
| Current budget status                  | `POST /api/admin/usage/limits/evaluate`; concrete `ORGANIZATION` or `USER` target with `client_id`, plus `period`   | Merged                                                                       |
| Threshold actions                      | `actions[]` on policies; `active_actions`, `next_action`, and `restrictions` on evaluation                          | Merged; shown read-only, preserved on save                                   |
| Department/group/org-subtree policy    | Not accepted as policy targets                                                                                      | Not supported, not simulated as per-user writes                              |

## Canonical requests

### Monthly policy upsert

```json
{
  "target": {
    "type": "USER",
    "client_id": "opaque-spend-id-from-ai_gateway",
    "user_id": "canonical-id-from-users"
  },
  "period": { "type": "RECURRING_CALENDAR_MONTH" },
  "value": {
    "mode": "FINITE",
    "amount": "600",
    "unit": "CREDITS",
    "enforcement": "HARD"
  }
}
```

The amount and unit must match the client’s real billing denomination. A USER omits `allocation_mode`; an ORGANIZATION requires `SHARED_POOL`; DEFAULT_USER requires `PER_MEMBER`. Unlimited value is only `{ "mode": "UNLIMITED" }`, without amount, unit, or enforcement. The body omits `actions`, so existing thresholds stay in place. Save displays the returned normalized policy, not only the input. Finite caps have float32 storage rounding.

### Policy reset

```json
{
  "target": {
    "type": "USER",
    "client_id": "opaque-spend-id-from-ai_gateway",
    "user_id": "canonical-id-from-users"
  },
  "period": { "type": "RECURRING_CALENDAR_MONTH" }
}
```

Reset removes the configured policy for that key. It does not clear measured usage. Listed USER policies may include `email`; the reset key sends `user_id` only.

### Budget evaluation

```json
{
  "target": { "type": "ORGANIZATION", "client_id": "glean" },
  "period": { "type": "RECURRING_CALENDAR_MONTH" }
}
```

Read headroom from `effective_limits[].remaining`, each rule’s cap from `evaluated_limits[].value.amount`, and its counter from `evaluated_limits[].used`. There is no per-rule `remaining`. When `decision` is not `AVAILABLE`, `decision_causes` names the budget scope (`TARGET` or `SHARED`) and source type.

## Promotion gates

1. **Sample:** all UI flows work with visibly fictional data and no credentials.
2. **Limits workspace (current):** real people, departments, and gateway clients; policy list, upsert, reset (after explicit opt-in), and evaluation.
3. **Group policy:** expose department and IdP-group controls only after the API accepts them as writable targets.

Production readiness is independent of these stages: this remains a local preview until real, authorized end-to-end verification.
