# API coverage and promotion gates

Contract snapshot: 2026-10-12. “Merged” describes reviewed source/PR status, **not** verified tenant deployment. No live credentials were used in the development of this preview.

| UI capability                          | REST operation / shape                                                                                   | Integration state                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| People, person picker, manager forest  | `GET /api/users?page_size=100&cursor=…`; `results[].user_id`, optional `department` and `manager`        | Merged; live adapter present; people load one page at a time                                   |
| Department directory filter            | `GET /api/departments`; `department_id`, `display_name`, `is_active`                                     | Merged; live adapter present. Does not filter historical usage                                 |
| Policy list                            | `GET /api/admin/usage/limits`; `results`, `has_more`, `next_cursor`                                      | Merged; bounded full pagination                                                                |
| Organization/default/user policy write | `POST /api/admin/usage/limits/batch`; body is **an array** of `UsageLimit`                               | Merged; one-item atomic upsert; live writes opt-in only                                        |
| Current budget status                  | `POST /api/admin/usage/limits/evaluate`; explicit concrete target + spend client + calendar-month period | Merged baseline; optional `used_by_unit` and per-rule `remaining` require reporting follow-ups |
| Historical charts and breakdowns       | `POST /api/admin/usage/search`; UTC range, `DAY` or `NONE`, `MODEL`/`USER` groupings, `DISPLAY_NAMES`    | Initial reporting stack still open; adapter follows the reviewed head contract                 |
| Client picker                          | `GET /api/admin/oauth/clients`; `ai_gateway.usage_client_id`                                             | Supporting stack open; unavailable state is explicit                                           |
| Group directory                        | `GET /api/admin/idp-groups`; `idp_group_id`, provider/instance metadata                                  | Supporting stack open; read-only catalog only                                                  |
| Department/group historical spend      | `DEPARTMENT`/`IDP_GROUP`, `department_name`/`group_id`                                                   | P1/deferred; deliberately not sent by this recipe                                              |
| Department/group/org-subtree policy    | No writable target in reviewed P0 limit contract                                                         | Blocked, not simulated as live writes                                                          |
| Model-specific policy                  | No `model_id` in P0 `UsageSelector`                                                                      | Blocked; model filters are reporting-only                                                      |
| Supported-model picker                 | No public Platform model catalog found in surveyed fragments                                             | Uses observed IDs/labels only, with coverage caveat                                            |

## Canonical requests

### Historical daily observations

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

When `has_more` is true, resend the query unchanged with `cursor: next_cursor`. `totals` describe the **whole query**, not the page; never add page totals together. Combine page buckets only within that cursor chain. Metadata can be null. Missing labels do not remove spend. `model_id: null` remains a separate unattributed bucket; null cannot be selected as a filter value.

### Public monthly policy upsert

```json
[
  {
    "target": { "type": "USER", "user_id": "canonical-id-from-users" },
    "usage_selector": {
      "client_id": "opaque-spend-id-from-ai_gateway",
      "period": { "type": "RECURRING_CALENDAR_MONTH" }
    },
    "value": {
      "mode": "FINITE",
      "amount": "600",
      "unit": "CREDITS",
      "enforcement": "HARD"
    }
  }
]
```

The amount/unit must match the client’s real billing denomination. A USER omits `allocation_mode`; an ORGANIZATION requires `SHARED_POOL`; DEFAULT_USER requires `PER_MEMBER`. Unlimited value is only `{ "mode": "UNLIMITED" }`, without amount/unit/enforcement. Save displays the returned normalized policy, not only the input. Finite caps have float32 storage rounding.

## Progress without waiting on every API

1. **Sample:** all UI flows work with visibly fictional data and no credentials.
2. **Landed API workspace:** real people/departments, policy list and organization/user mutations (after explicit opt-in), baseline budget evaluation; reporting/client/group panels show unavailable until deployed. Glean is the one known spend-client choice.
3. **Supporting catalogs:** gateway-client picker uses returned IDs; org forest uses paginated directory relationships; groups are inspectable, not writable.
4. **Initial reporting:** activate real observations, model/user breakdowns, page replay, nullable freshness and optional richer evaluation fields. No certified-storage dependency is required for this stage.
5. **Expanded policy:** only expose department/group/org-node controls after an explicit membership and writable-target contract. Model eligibility/catalog and model limits are separate API decisions.

Production readiness is independent of these stages: this remains a local preview until real, authorized end-to-end verification.
