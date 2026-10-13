# White-label usage and limits dashboard

A runnable, **preview** cookbook recipe for rebuilding a usage-and-limits admin experience on Platform APIs. The default is an explicitly fictional, credential-free sample—not a claim that an endpoint is deployed.

## Run the sample

Requires Node 22.12.0 or newer. From this directory:

```sh
npm ci
npm run verify:fixture
npm start
```

Open the **Local URL printed by the server**. It prefers port 3217 and chooses an available port if that port is busy; `PORT=0` also selects an available port. Sample policies live in memory and reset when the server restarts. Customize the labels with `DASHBOARD_BRAND` and `DASHBOARD_WORKSPACE`; edit the CSS variables for your palette.

1. **Overview:** daily observed-consumption chart, separate USD/credit totals, and a model breakdown that filters the chart.
2. **People:** search name/email, filter the directory by department, load additional pages, open a person, and inspect configured-budget evaluation.
3. **Limits:** review organization budgets, default per-person policies, and individual overrides. Preview the exact policy before applying it. A save replaces its natural key; it does not reset usage.
4. **Organization:** browse a manager-based forest and open individual people. A manager relationship does **not** establish an IdP group, budget pool, or authoritative team membership.
5. **API test bench:** replay read-only usage/evaluation requests and follow opaque snapshot pages with the original query intact.

## Connect real APIs progressively

Live mode never substitutes sample data when an API is missing, forbidden, or unavailable. Directory, clients, groups, limits, evaluation, and reporting display independent availability states. This lets the same UI demonstrate landed limits APIs before reporting and supporting catalogs are deployed.

Set only the backend origin, not a full API path:

```sh
export GLEAN_SERVER_URL='https://your-instance-be.glean.com'
npm run login -- --server-url "$GLEAN_SERVER_URL"
npm run verify:live
npm run start:live
```

OAuth login is interactive and must be completed by the operator. The pinned `@gleanwork/auth` package owns PKCE and refreshable credential storage outside the project. If a tenant cannot issue these native experimental scopes, use an administrator-provisioned authorized client or a **server-side** `GLEAN_API_TOKEN` fallback; do not put tokens in browser storage, URLs, committed files, or screenshots. Existing pre-issuance tokens may need the `ADMIN_USAGE` and `PEOPLE` legacy scope families rather than native scopes. Verify actual permissions with the read-only probe.

### Required capabilities

| Operation              | Native scope               | Permission / behavior                              |
| ---------------------- | -------------------------- | -------------------------------------------------- |
| People                 | `users:read`               | Visible directory people; active users by default  |
| Departments            | `departments:read`         | Directory catalog, not a spend aggregation         |
| Historical usage       | `admin.usage:read`         | Billing read; experimental search rollout required |
| Live budget evaluation | `admin.usage:evaluate`     | Billing read                                       |
| Read policies          | `admin.usage.limits:read`  | Billing read                                       |
| Apply policies         | `admin.usage.limits:write` | Billing edit plus explicit local write opt-in      |
| OAuth-client picker    | `admin.oauth.clients:read` | Admin read or billing read; pending supporting API |
| IdP-group catalog      | `admin.idp_groups:read`    | Admin read or billing read; pending supporting API |

Every upstream request sends `X-Glean-Include-Experimental: true`. Merged code does not imply your tenant supports a scope or has deployed an operation.

**Live writes are off by default.** After checking the workspace and obtaining explicit authorization to mutate its policies, restart with:

```sh
GLEAN_ENABLE_WRITES=true npm run start:live
```

The browser still requires **Review policy → Apply to connected workspace**. No startup test or verification command writes a policy. A timed-out write has an uncertain outcome: read policies before deciding whether to retry. The transport never automatically retries mutations.

## Important semantics

- Historical search measures **observed stored rows**. It is not an invoice, certified completeness, or a live counter. `data_updated_at: null` and `earliest_available_at: null` mean unknown, not fresh or empty.
- Empty results, missing units, and missing days do not prove zero. Charts show observed buckets, with exact decimal values in an accessible table. Chart geometry is approximate; policy amounts and ledger arithmetic retain decimal strings/integer micro-units.
- USD and CREDITS remain separate. Select the actual billing denomination for the spend domain when creating a finite limit; the client catalog does not currently provide it. The live backend remains authoritative.
- `effective_limits[].remaining` is the tightest current headroom. It is not the person’s configured cap and may come from an organization rule. Per-rule cap, used, and remaining values are shown separately. No matching policy is not runtime admission.
- The client picker uses `ai_gateway.usage_client_id` **verbatim**, never OAuth `client_id` or a constructed `oauth-` prefix. It includes the documented Glean spend client separately. Only returned active gateway-capable static OAuth clients are additional choices; this is not every DCR/MCP client.
- Department filters currently apply to the directory only. Department/group spend aggregation is deferred by the reporting contract. Model selection filters observed usage, **not** policy writes.
- Department, IdP-group, org-subtree, and model-limit actions are visibly gated. The recipe does not manufacture per-user writes to imitate dynamic group policy.

See [API coverage](docs/API-COVERAGE.md) for the bridge contract and promotion gates.

## Architecture and safety

`public/` is the browser UI. `server.mjs` exposes only explicit local routes. `lib/demo.mjs` supplies fictional records; `lib/live.mjs` supplies the same provider operations from real REST APIs. `lib/contracts.mjs` handles request bounds, supported targets, exact IDs, and decimal policy values.

The temporary REST bridge is deliberate: the reporting and supporting identity operations are ahead of the released cookbook SDK. Replace it with a pinned official SDK once those exact contracts ship. It does not replace the supported auth implementation.

This is a **local, single-operator test bed**, not a hosted multi-admin service. The server binds to `127.0.0.1`, rejects foreign Host/Origin and cross-site requests, requires same-origin JSON mutation headers, serves a restrictive CSP, bounds bodies and upstream requests, and keeps credentials server-side. There are no analytics, external resources, proxy-to-arbitrary-URL routes, or credential inputs in the browser. Before hosting, add real session authentication, per-admin authorization, CSRF protection, audit logging, and isolated credential storage. Never expose this server through a public tunnel.

## Verification and completion

`npm test` tests policy shapes, decimals, unavailable states, public batch-array transport, exact client mapping, cursor continuity, directory cycles, write gating, and server origin protection. `npm run verify:live` fails without real configuration and only makes read-only requests. Optional supporting-catalog failures are reported independently; required usage/directory failures fail the probe.

Fixture tests **do not** qualify as live verification. `lastVerified` is deliberately unset. Promote the recipe from preview only after an authorized sandbox browser run proves real people/client enumeration, complete chart pagination, save/read-back/evaluate agreement, unavailable states, and an isolated policy cleanup plan. Do not test writes on a production workspace merely to make the recipe green.
