# White-label usage limits dashboard

A runnable, **preview** cookbook recipe for rebuilding a usage limits admin experience on the Glean usage limits APIs. It sets organization, default per-person, and individual monthly limits, and explains why a person is warned or blocked. It connects to your workspace by default; `npm run demo` runs an explicitly fictional sample without credentials.

## Run it against your workspace

Requires Node 22.12.0 or newer, workspace billing permissions, and a user-scoped Client API token. From this directory:

```sh
npm ci
npm run verify:fixture
cp .env.example .env
```

Open `.env` in your editor and set:

- `GLEAN_SERVER_URL`: your Glean backend origin, such as `https://your-instance-be.glean.com`, with no path. See [finding your server URL](https://developers.glean.com/get-started/authentication#finding-your-server-url).
- `GLEAN_API_TOKEN`: a Client API token with the `ADMIN_USAGE` and `PEOPLE` scopes, created in [Token Management](https://app.glean.com/admin/platform/tokenManagement?tab=client) by a user with workspace billing permissions. Choose a user-scoped token; the limits APIs act as that user. Never commit, paste, or print it.

Then verify and start:

```sh
npm run verify
npm start
```

`npm run verify` makes read-only requests and exits non-zero when a required API is missing, forbidden, or unavailable. Values already set in the environment take precedence over `.env`.

Open the **Local URL printed by the server**. It prefers port 3217 and chooses an available port if that port is busy; `PORT=0` also selects an available port. Customize the labels with `DASHBOARD_BRAND` and `DASHBOARD_WORKSPACE`; edit the CSS variables for your palette.

1. **Limits:** review organization budgets, default per-person policies, individual overrides, and their threshold actions. Preview the exact policy before applying it. A save replaces its natural key (target, spend client, and period) and keeps the policy's existing threshold actions; it does not reset usage. **Remove this policy** resets that key so the target falls back to inherited policy.
2. **People:** search name or email, filter the directory by department, load additional pages, open a person, and see their live budget status.
3. **Organization:** browse a manager-based forest and open individual people. A manager relationship does **not** establish a budget pool or authoritative team membership.

## Run the sample

```sh
npm run demo
```

Every person, client, and amount is fictional, and policies live in memory until the server restarts. The sample exercises the UI; it is not verification of any workspace.

## Live behavior

Live mode never substitutes sample data when an API is missing, forbidden, or unavailable. People, departments, spend clients, and limits display independent availability states.

The token stays in the local Node server. It is never sent to the browser, written to URLs, or logged; upstream error bodies are not forwarded.

### Required capabilities

| Operation                | Token scope   | Permission / behavior                         |
| ------------------------ | ------------- | --------------------------------------------- |
| People                   | `PEOPLE`      | Visible directory people                      |
| Departments              | `PEOPLE`      | Directory catalog, not a spend aggregation    |
| Spend-client picker      | `ADMIN_USAGE` | Admin read or billing read                    |
| Read policies            | `ADMIN_USAGE` | Billing read                                  |
| Live budget evaluation   | `ADMIN_USAGE` | Billing read                                  |
| Apply or remove policies | `ADMIN_USAGE` | Billing edit plus explicit local write opt-in |

The `ADMIN` role alone does not grant usage administration; the token's user needs workspace billing permissions.

Every upstream request sends `X-Glean-Include-Experimental: true`. Merged code does not imply your tenant has deployed an operation; the read-only probe checks what your workspace actually allows.

**Live writes are off by default.** After checking the workspace and obtaining explicit authorization to change its limits, set `GLEAN_ENABLE_WRITES=true` in `.env` and restart `npm start`.

The browser still requires **Review policy → Apply to connected workspace**. No startup test or verification command writes a policy. A timed-out write has an uncertain outcome: read policies before deciding whether to retry. The transport never automatically retries mutations.

## Important semantics

- `effective_limits[].remaining` is the tightest current headroom. It is not the person's configured cap and may come from an organization rule. Each evaluated rule shows its configured cap, accrued `used`, decision, and active or next threshold action. `decision_causes` says whether the person's own budget or a shared pool caused WARNING or BLOCKED, without revealing the pool's amount. `restrictions` lists active premium-model allowlists. No matching policy is not runtime admission.
- Limits are keyed by `target` (whose `client_id` is the spend client) and `period`. Saves omit `actions`, which preserves thresholds configured in the Admin console; sending `[]` would clear them. The workspace premium-model policy (`DEFAULT_USER` with `client_id: "*"`) has actions but no cap, and the recipe shows it read-only.
- USD and CREDITS remain separate. Select the actual billing denomination for the spend client when creating a finite limit; the client catalog does not currently provide it. The live backend remains authoritative.
- The client picker uses `ai_gateway.usage_client_id` **verbatim**, never OAuth `client_id` or a constructed `oauth-` prefix, and includes the documented `glean` spend client separately. Only enabled static OAuth clients with LLM Gateway access are listed; DCR clients and `api-token-*` spend clients are not. Client IDs found on configured policies are added from the policy list, and **Other client ID…** accepts any other exact spend-client ID.
- Department filters apply to the directory only. Department, IdP-group, org-subtree, and model limits are not supported, and the recipe does not manufacture per-user writes to imitate them.

See [API coverage](docs/API-COVERAGE.md) for the bridge contract and promotion gates.

## Architecture and safety

`public/` is the browser UI. `server.mjs` exposes only explicit local routes. `lib/demo.mjs` supplies fictional records; `lib/live.mjs` supplies the same provider operations from the real APIs. `lib/contracts.mjs` handles request bounds, supported targets, exact IDs, and decimal policy values.

People and departments come from the pinned `@gleanwork/api-client` SDK, which retries transient reads. The usage operations and the OAuth client list go through a narrow REST bridge: the released SDK has no usage operations, and its OAuth client model predates `is_enabled`. Move each call to the SDK once a release covers its current contract. The bridge never retries a write.

This is a **local, single-operator tool**, not a hosted multi-admin service. The server binds to `127.0.0.1`, rejects foreign Host/Origin and cross-site requests, requires same-origin JSON mutation headers, serves a restrictive CSP, bounds bodies and upstream requests, and keeps the token server-side. There are no analytics, external resources, proxy-to-arbitrary-URL routes, or credential inputs in the browser. Before hosting, add real session authentication, per-admin authorization, CSRF protection, audit logging, and isolated credential storage. Never expose this server through a public tunnel.

## Verification and completion

`npm test` runs Vitest. Live-provider tests drive the real SDK and bridge against [MSW](https://mswjs.io/) handlers. The suite covers policy shapes, evaluation and reset keys, decimals, unavailable states, the public upsert and reset transport, exact client mapping, cursor continuity, directory cycles, write gating, environment configuration, and server origin protection. `npm run verify` fails without real configuration and only makes read-only requests.

Fixture tests **do not** qualify as live verification. `lastVerified` is deliberately unset. Promote the recipe from preview only after an authorized workspace browser run proves real people and client enumeration, save/read-back/evaluate agreement, unavailable states, and an isolated policy cleanup plan. Do not test writes on a production workspace merely to make the recipe green.
