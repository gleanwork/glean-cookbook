# API coverage and promotion gates

Contract snapshot: 2026-11-06, from the Platform API OpenAPI fragments on the Glean main branch. “Merged” describes reviewed source, **not** verified tenant deployment. Every operation is experimental and needs `X-Glean-Include-Experimental: true`.

| UI capability                          | REST operation / shape                                                                                              | Integration state                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| People, person picker, manager forest  | `GET /api/users?page_size=100&cursor=…`; `results[].user_id`, `email`, optional `department` and `manager`          | Merged; people load one page at a time                                       |
| Department directory filter            | `GET /api/departments`; `department_id`, `display_name`                                                             | Merged. A department ID derives from its name, so a rename changes the ID    |
| Spend-client picker                    | `GET /api/admin/oauth/clients?filters=[{"field":"has_ai_gateway","values":["true"]}]`; `ai_gateway.usage_client_id` | Merged. Lists enabled static clients only; `glean` is a documented constant  |
| Group directory                        | `GET /api/admin/idp-groups`; `idp_group_id`, provider metadata                                                      | Merged; read-only catalog, no membership listing                             |
| Policy list                            | `GET /api/admin/usage/limits`; `results[]` of `{target, period, value?, allocation_mode?, actions?}`                | Merged; bounded full pagination                                              |
| Organization/default/user policy write | `POST /api/admin/usage/limits`; one `UsageLimit`, returns `usage_limit`                                             | Merged; live writes opt-in only                                              |
| Policy removal                         | `POST /api/admin/usage/limits/reset`; natural key `{target, period}`, returns `is_configuration_removed`            | Merged; live writes opt-in only                                              |
| Current budget status                  | `POST /api/admin/usage/limits/evaluate`; concrete `ORGANIZATION` or `USER` target with `client_id`, plus `period`   | Merged                                                                       |
| Threshold actions                      | `actions[]` on policies; `active_actions`, `next_action`, and `restrictions` on evaluation                          | Merged; shown read-only, preserved on save                                   |
| Historical charts and breakdowns       | `POST /api/admin/usage/search`                                                                                      | Draft reporting stack, not on main; the panel shows unavailable in live mode |
| Department/group/org-subtree policy    | `DEPARTMENT` and `IDP_GROUP` are response-only policy sources                                                       | Blocked, not simulated as live writes                                        |
| Supported-model picker                 | No public Platform model catalog                                                                                    | Uses observed IDs and labels only, with a coverage caveat                    |

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

### Historical daily observations (draft)

This follows the reviewed draft of the reporting contract and will change before it ships.

```json
{
  "target": { "type": "ORGANIZATION" },
  "time_range": {
    "start": "2026-10-01T00:00:00Z",
    "end": "2026-11-01T00:00:00Z"
  },
  "granularity": "DAY",
  "group_by": [],
  "filters": [{ "field": "client_id", "values": ["glean"] }],
  "include": ["DISPLAY_NAMES"],
  "page_size": 1000
}
```

When `has_more` is true, resend the query unchanged with `cursor: next_cursor`. `totals` describe the **whole query**, not the page; never add page totals together. Metadata can be null. Missing labels do not remove spend. `model_id: null` remains a separate unattributed bucket.

## Promotion gates

1. **Sample:** all UI flows work with visibly fictional data and no credentials.
2. **Limits workspace (current):** real people, departments, gateway clients, and groups; policy list, upsert, reset (after explicit opt-in), and evaluation. Reporting shows unavailable.
3. **Reporting:** activate real observations and model or user breakdowns once the reporting API ships.
4. **Group policy:** expose department and IdP-group controls only after the API accepts them as writable targets.

Production readiness is independent of these stages: this remains a local preview until real, authorized end-to-end verification.
